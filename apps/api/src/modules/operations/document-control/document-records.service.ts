import { Injectable, NotFoundException } from '@nestjs/common';
import { DocumentCriticality, DocumentRecordStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { FilterDocumentRecordsDto } from './dto/filter-documents.dto';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export type DerivedDocumentStatus =
  | 'VIGENTE'
  | 'POR_VENCER'
  | 'VENCIDO'
  | 'BORRADOR'
  | 'PENDIENTE_REVISION'
  | 'APROBADO'
  | 'RECHAZADO'
  | 'REEMPLAZADO'
  | 'ARCHIVADO';

export type ComplianceState = 'MISSING' | 'EXPIRED' | 'EXPIRING_SOON' | 'VALID';

interface RequirementForCompliance {
  documentTypeId: string;
  alertDaysBefore: number;
  criticality: DocumentCriticality;
}

@Injectable()
export class DocumentRecordsService {
  constructor(private readonly prisma: PrismaService) {}

  /* Derived UI status — folds expiration windows on top of the persisted
     status. Only APPROVED+expiring docs flip to VIGENTE/POR_VENCER/VENCIDO;
     other statuses pass through translated. */
  private deriveStatus(
    status: DocumentRecordStatus,
    expirationDate: Date | null,
    alertDaysBefore: number,
    now: Date,
  ): DerivedDocumentStatus {
    if (status === 'APPROVED' && expirationDate) {
      const ms = expirationDate.getTime() - now.getTime();
      const days = Math.floor(ms / 86400000);
      if (days < 0) return 'VENCIDO';
      if (days <= alertDaysBefore) return 'POR_VENCER';
      return 'VIGENTE';
    }
    if (status === 'APPROVED') return 'APROBADO';
    if (status === 'DRAFT') return 'BORRADOR';
    if (status === 'PENDING_REVIEW') return 'PENDIENTE_REVISION';
    if (status === 'REJECTED') return 'RECHAZADO';
    if (status === 'REPLACED') return 'REEMPLAZADO';
    return 'ARCHIVADO';
  }

  async findAll(companyId: string, filters: FilterDocumentRecordsDto) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, filters.limit ?? DEFAULT_LIMIT));
    const skip = (page - 1) * limit;

    const now = new Date();
    /* Strip the time so comparisons line up with DB DATE columns. */
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const where: Prisma.DocumentRecordWhereInput = {
      companyId,
      isActive: filters.isActive ?? true,
    };
    if (filters.assetId) where.assetId = filters.assetId;
    if (filters.documentTypeId) where.documentTypeId = filters.documentTypeId;
    if (filters.status) where.status = filters.status;
    /* Build the expirationDate filter in a local variable, then assign once.
       Prisma's `expirationDate` is `Date | DateTimeFilter` so spreading on it
       isn't safe — we keep it as a plain DateTimeFilter object here. */
    const expirationFilter: Prisma.DateTimeNullableFilter = {};
    if (filters.expirationFrom) expirationFilter.gte = new Date(filters.expirationFrom);
    if (filters.expirationTo) expirationFilter.lte = new Date(filters.expirationTo);
    if (filters.expiringInDays != null) {
      const horizon = new Date(today);
      horizon.setUTCDate(horizon.getUTCDate() + filters.expiringInDays);
      expirationFilter.gte = today;
      expirationFilter.lte = horizon;
      /* Only APPROVED docs make sense in "expiring soon" — otherwise we'd
         surface drafts too. */
      where.status = 'APPROVED';
    }
    if (filters.isExpired) {
      expirationFilter.lt = today;
      where.status = 'APPROVED';
    }
    if (Object.keys(expirationFilter).length > 0) {
      where.expirationDate = expirationFilter;
    }
    if (filters.search?.trim()) {
      const s = filters.search.trim();
      where.OR = [
        { fileName: { contains: s, mode: 'insensitive' } },
        { asset: { code: { contains: s, mode: 'insensitive' } } },
        { asset: { name: { contains: s, mode: 'insensitive' } } },
        { documentType: { name: { contains: s, mode: 'insensitive' } } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.documentRecord.findMany({
        where,
        select: {
          id: true,
          assetId: true,
          documentTypeId: true,
          fileName: true,
          mimeType: true,
          fileSize: true,
          issueDate: true,
          expirationDate: true,
          status: true,
          statusReason: true,
          version: true,
          uploadedBy: true,
          createdAt: true,
          updatedAt: true,
          asset: {
            select: {
              id: true,
              code: true,
              name: true,
              status: true,
              assetType: { select: { id: true, name: true, category: true, color: true } },
            },
          },
          documentType: {
            select: {
              id: true,
              name: true,
              code: true,
              category: true,
              criticality: true,
              blocksOperation: true,
              alertDaysBefore: true,
              hasExpiration: true,
              defaultValidityDays: true,
              color: true,
            },
          },
        },
        /* Closest expirations first; nulls (no-expiration docs) at the end. */
        orderBy: [{ expirationDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.documentRecord.count({ where }),
    ]);

    const data = rows.map((r) => ({
      ...r,
      derivedStatus: this.deriveStatus(
        r.status,
        r.expirationDate,
        r.documentType.alertDaysBefore,
        now,
      ),
    }));

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findOne(id: string, companyId: string) {
    const row = await this.prisma.documentRecord.findFirst({
      where: { id, companyId },
      include: {
        asset: {
          select: {
            id: true,
            code: true,
            name: true,
            assetType: { select: { id: true, name: true, category: true } },
          },
        },
        documentType: true,
        replacedBy: { select: { id: true, fileName: true, version: true, status: true } },
        replaces: {
          select: { id: true, fileName: true, version: true, status: true, createdAt: true },
          orderBy: { version: 'desc' },
        },
      },
    });
    if (!row) throw new NotFoundException('Documento no encontrado');
    const now = new Date();
    return {
      ...row,
      derivedStatus: this.deriveStatus(
        row.status,
        row.expirationDate,
        row.documentType.alertDaysBefore,
        now,
      ),
    };
  }

  /* Walks every active asset in the company, resolves its required documents
     via the same most-specific-wins rule used by DocumentRequirementsService,
     and computes the compliance state for each (asset, documentType) pair.
     The latest APPROVED+isActive DocumentRecord wins; everything else (draft,
     pending review, expired, missing) counts as a gap. */
  async getCompliance(companyId: string) {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const [assets, requirements, latestApprovedRecords] = await Promise.all([
      this.prisma.operationalAsset.findMany({
        where: { companyId, isActive: true },
        select: { id: true, assetTypeId: true, assetSubtypeId: true },
      }),
      this.prisma.documentRequirement.findMany({
        where: { companyId },
        select: {
          id: true,
          documentTypeId: true,
          assetTypeId: true,
          assetSubtypeId: true,
          assetId: true,
          documentType: {
            select: {
              id: true,
              alertDaysBefore: true,
              criticality: true,
            },
          },
        },
      }),
      /* Pull every APPROVED, isActive doc once and bucket them by
         (assetId, documentTypeId) keeping only the latest createdAt — much
         cheaper than N+1 queries per asset. */
      this.prisma.documentRecord.findMany({
        where: { companyId, isActive: true, status: 'APPROVED' },
        select: {
          assetId: true,
          documentTypeId: true,
          expirationDate: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    /* Group requirements by candidate (asset/subtype/type) for fast lookup
       per asset. */
    const byAsset = new Map<string, RequirementForCompliance[]>();
    const bySubtype = new Map<string, RequirementForCompliance[]>();
    const byType = new Map<string, RequirementForCompliance[]>();
    for (const r of requirements) {
      const entry: RequirementForCompliance = {
        documentTypeId: r.documentTypeId,
        alertDaysBefore: r.documentType.alertDaysBefore,
        criticality: r.documentType.criticality,
      };
      if (r.assetId) {
        const list = byAsset.get(r.assetId) ?? [];
        list.push(entry);
        byAsset.set(r.assetId, list);
      } else if (r.assetSubtypeId) {
        const list = bySubtype.get(r.assetSubtypeId) ?? [];
        list.push(entry);
        bySubtype.set(r.assetSubtypeId, list);
      } else if (r.assetTypeId) {
        const list = byType.get(r.assetTypeId) ?? [];
        list.push(entry);
        byType.set(r.assetTypeId, list);
      }
    }

    /* (assetId, documentTypeId) → latest-by-createdAt approved doc. We rely on
       the orderBy above to make the first-seen entry the winner. */
    const latestByPair = new Map<string, { expirationDate: Date | null }>();
    for (const rec of latestApprovedRecords) {
      const key = `${rec.assetId}::${rec.documentTypeId}`;
      if (!latestByPair.has(key)) {
        latestByPair.set(key, { expirationDate: rec.expirationDate });
      }
    }

    let totalRequiredDocuments = 0;
    let uploaded = 0;
    let missing = 0;
    let expired = 0;
    let expiringSoon = 0;
    let valid = 0;
    let assetsWithFullCompliance = 0;
    const bySeverity: Record<Lowercase<DocumentCriticality>, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    for (const asset of assets) {
      /* Most-specific-wins: a documentType set at asset level overrides
         subtype, which overrides type. We materialize the merged set per
         asset, then walk it. */
      const merged = new Map<string, RequirementForCompliance>();
      for (const r of byType.get(asset.assetTypeId) ?? []) merged.set(r.documentTypeId, r);
      if (asset.assetSubtypeId) {
        for (const r of bySubtype.get(asset.assetSubtypeId) ?? []) merged.set(r.documentTypeId, r);
      }
      for (const r of byAsset.get(asset.id) ?? []) merged.set(r.documentTypeId, r);

      let assetCompliant = merged.size > 0;
      for (const req of merged.values()) {
        totalRequiredDocuments++;
        const rec = latestByPair.get(`${asset.id}::${req.documentTypeId}`);
        let state: ComplianceState;
        if (!rec) {
          state = 'MISSING';
        } else if (rec.expirationDate && rec.expirationDate < today) {
          state = 'EXPIRED';
        } else if (rec.expirationDate) {
          const days = Math.floor((rec.expirationDate.getTime() - today.getTime()) / 86400000);
          state = days <= req.alertDaysBefore ? 'EXPIRING_SOON' : 'VALID';
        } else {
          state = 'VALID';
        }

        if (state === 'MISSING') {
          missing++;
          assetCompliant = false;
        } else {
          uploaded++;
          if (state === 'EXPIRED') {
            expired++;
            assetCompliant = false;
          } else if (state === 'EXPIRING_SOON') {
            expiringSoon++;
          } else {
            valid++;
          }
        }

        /* Severity is counted ONLY for problem rows (missing+expired) so the
           UI can warn about CRITICAL gaps that block operation. */
        if (state === 'MISSING' || state === 'EXPIRED') {
          const sev = req.criticality.toLowerCase() as Lowercase<DocumentCriticality>;
          bySeverity[sev]++;
        }
      }
      if (assetCompliant && merged.size > 0) {
        assetsWithFullCompliance++;
      }
    }

    const compliancePercentage =
      totalRequiredDocuments === 0
        ? 100
        : Math.round(((valid + expiringSoon) / totalRequiredDocuments) * 1000) / 10;

    return {
      totalAssets: assets.length,
      assetsWithFullCompliance,
      assetsWithIssues: assets.length - assetsWithFullCompliance,
      totalRequiredDocuments,
      uploaded,
      missing,
      expired,
      expiringSoon,
      valid,
      compliancePercentage,
      bySeverity,
    };
  }
}
