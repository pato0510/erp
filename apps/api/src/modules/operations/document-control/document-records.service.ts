import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DocumentCriticality, DocumentRecordStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { StorageService } from '../../common/storage/storage.service';
import { AssetBlockingService } from '../alerts/asset-blocking.service';
import { DocumentRequirementsService } from '../document-requirements/document-requirements.service';
import { ArchiveDocumentDto } from './dto/archive-document.dto';
import { CreateDocumentDto } from './dto/create-document.dto';
import { FilterDocumentRecordsDto } from './dto/filter-documents.dto';
import { FilterPendingReviewDto } from './dto/filter-pending-review.dto';
import { RejectDocumentDto } from './dto/reject-document.dto';
import { SupersedeDocumentDto } from './dto/supersede-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const DOCUMENTS_BUCKET = process.env.SII_CERT_BUCKET || 'excelsia-documents';
const FILE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

/* MIME → allowed extension map. We accept files when EITHER the mimetype is
   on the list OR the extension matches a known doc/image/spreadsheet — some
   browsers report office docs with octet-stream so the extension fallback is
   load-bearing. */
const ALLOWED_MIMETYPES = new Set<string>([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
const ALLOWED_EXTENSIONS = new Set<string>([
  'pdf',
  'jpg',
  'jpeg',
  'png',
  'webp',
  'doc',
  'docx',
  'xls',
  'xlsx',
]);

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
  private readonly logger = new Logger(DocumentRecordsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
    private readonly storage: StorageService,
    private readonly requirementsService: DocumentRequirementsService,
    /* forwardRef breaks the AlertRulesModule ↔ DocumentControlModule
       cycle: alerts depend on requirements (transitively, via the
       engine) but blocking lives in alerts and is invoked from here. */
    @Inject(forwardRef(() => AssetBlockingService))
    private readonly blockingService: AssetBlockingService,
  ) {}

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
    /* OPS-016 — by default REPLACED versions are hidden so the central list
       only surfaces current versions. The toggle on the frontend flips
       includeReplaced=true; an explicit status=REPLACED filter takes
       precedence either way (operator chose that bucket on purpose). */
    if (!filters.includeReplaced && filters.status !== 'REPLACED') {
      where.status = where.status ?? { not: 'REPLACED' };
    }
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
      /* Pull every APPROVED, isActive, non-superseded doc once and bucket
         them by (assetId, documentTypeId) keeping only the latest createdAt
         — much cheaper than N+1 queries per asset. The status='APPROVED'
         filter already excludes REPLACED rows (status flips on
         supersession), but we also require replacedByDocumentId=null as a
         belt-and-braces guard against any out-of-band updates. */
      this.prisma.documentRecord.findMany({
        where: {
          companyId,
          isActive: true,
          status: 'APPROVED',
          replacedByDocumentId: null,
        },
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

    /* OPS-019 — surface the active alert workload alongside compliance
       so the central docs dashboard can show "X alertas activas" without
       a second round-trip. CRITICAL+BLOCKING is the headline number.
       OPS-020 adds the blocked + at-risk asset counts so the same call
       feeds the "Activos bloqueados" banner. assetsAtRiskCount =
       distinct assets with ACTIVE BLOCKING alerts that AREN'T yet
       BLOCKED_DOCUMENTAL (i.e. would auto-block if the toggle was
       on). */
    const sevenDaysAhead = new Date(today);
    sevenDaysAhead.setUTCDate(sevenDaysAhead.getUTCDate() + 7);
    const [
      activeAlertsCount,
      criticalAlertsCount,
      blockedAssetsCount,
      atRiskAssets,
      assetsWithActiveExceptions,
      exceptionsAboutToExpire,
    ] = await Promise.all([
      this.prisma.alertInstance.count({
        where: { companyId, status: 'ACTIVE' },
      }),
      this.prisma.alertInstance.count({
        where: { companyId, status: 'ACTIVE', severity: { in: ['CRITICAL', 'BLOCKING'] } },
      }),
      this.prisma.operationalAsset.count({
        where: { companyId, isActive: true, status: 'BLOCKED_DOCUMENTAL' },
      }),
      this.prisma.alertInstance.findMany({
        where: {
          companyId,
          status: 'ACTIVE',
          severity: 'BLOCKING',
          asset: { status: { not: 'BLOCKED_DOCUMENTAL' }, isActive: true },
        },
        select: { assetId: true },
        distinct: ['assetId'],
      }),
      /* OPS-023 — count of assets currently riding on an APPROVED
         exception (i.e. would be BLOCKED_DOCUMENTAL but for the
         override). */
      this.prisma.assetException.count({
        where: { companyId, status: 'APPROVED' },
      }),
      /* APPROVED exceptions whose validUntil falls inside the next 7
         days — operations supervisors should plan to renew docs
         before then. */
      this.prisma.assetException.count({
        where: {
          companyId,
          status: 'APPROVED',
          validUntil: { gte: today, lt: sevenDaysAhead },
        },
      }),
    ]);
    const assetsAtRiskCount = atRiskAssets.length;

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
      activeAlertsCount,
      criticalAlertsCount,
      blockedAssetsCount,
      assetsAtRiskCount,
      assetsWithActiveExceptions,
      exceptionsAboutToExpire,
    };
  }

  /* Validates an uploaded file against the size + MIME/extension allow-list.
     Either the mimetype OR the extension must be on the allow-list — this
     covers browsers that send `application/octet-stream` for Office docs. */
  private validateFile(file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Falta el archivo a cargar.');
    if (file.size === 0) throw new BadRequestException('El archivo está vacío.');
    if (file.size > FILE_MAX_BYTES) {
      throw new BadRequestException('El archivo excede el límite de 10 MB.');
    }
    const ext = file.originalname.split('.').pop()?.toLowerCase() ?? '';
    const mimeOk = ALLOWED_MIMETYPES.has(file.mimetype);
    const extOk = ALLOWED_EXTENSIONS.has(ext);
    if (!mimeOk && !extOk) {
      throw new BadRequestException(
        'Formato no permitido. Usa PDF, JPG, PNG, WEBP, DOC, DOCX, XLS o XLSX.',
      );
    }
  }

  /* Validates that the asset and document type both belong to the company —
     guards against cross-tenant references via crafted UUIDs. Returns the
     fetched documentType so the caller can use its expiration metadata. */
  private async validateRefs(companyId: string, assetId: string, documentTypeId: string) {
    const [asset, documentType] = await Promise.all([
      this.prisma.operationalAsset.findFirst({
        where: { id: assetId, companyId },
        select: { id: true },
      }),
      this.prisma.operationalDocumentType.findFirst({
        where: { id: documentTypeId, companyId },
        select: {
          id: true,
          hasExpiration: true,
          defaultValidityDays: true,
        },
      }),
    ]);
    if (!asset) throw new BadRequestException('El activo no existe en esta empresa.');
    if (!documentType) {
      throw new BadRequestException('El tipo de documento no existe en esta empresa.');
    }
    return { documentType };
  }

  /* Persist a file via MinIO when configured, falling back to a DB blob.
     Returns the (filePath, fileData) pair to embed on a DocumentRecord row.
     The recordId is provided by the caller so the storage key is stable
     regardless of insert ordering. */
  private async storeFile(
    companyId: string,
    recordId: string,
    file: Express.Multer.File,
  ): Promise<{ filePath: string | null; fileData: Uint8Array<ArrayBuffer> | null }> {
    const safeFileName = file.originalname.replace(/[^\w.-]+/g, '_');
    const storageKey = `operations/documents/${companyId}/${recordId}/${safeFileName}`;
    if (this.storage.isConfigured()) {
      try {
        await this.storage.uploadFile(DOCUMENTS_BUCKET, storageKey, file.buffer, file.mimetype);
        return { filePath: storageKey, fileData: null };
      } catch (err) {
        this.logger.warn(
          `MinIO upload failed (${err instanceof Error ? err.message : err}); falling back to DB blob`,
        );
        return { filePath: null, fileData: Uint8Array.from(file.buffer) };
      }
    }
    this.logger.warn('MinIO not available, storing document in DB blob');
    return { filePath: null, fileData: Uint8Array.from(file.buffer) };
  }

  /* Computes the next version number for a given (asset, documentType) pair.
     Walks every existing record (including archived/replaced) so we never
     reuse a number — version is monotonic per pair, even across resets. */
  private async nextVersion(
    companyId: string,
    assetId: string,
    documentTypeId: string,
  ): Promise<number> {
    const latest = await this.prisma.documentRecord.aggregate({
      where: { companyId, assetId, documentTypeId },
      _max: { version: true },
    });
    return (latest._max.version ?? 0) + 1;
  }

  async create(
    companyId: string,
    userId: string,
    dto: CreateDocumentDto,
    file: Express.Multer.File | undefined,
  ) {
    this.validateFile(file);
    /* Asserted by validateFile but TS narrowing doesn't cross the function. */
    if (!file) throw new BadRequestException('Falta el archivo a cargar.');

    const { documentType } = await this.validateRefs(companyId, dto.assetId, dto.documentTypeId);

    /* Only DRAFT and PENDING_REVIEW are valid landing statuses on creation —
       APPROVED/REJECTED/REPLACED/ARCHIVED belong to the workflow endpoints. */
    const status: DocumentRecordStatus = dto.setStatus ?? 'DRAFT';
    if (status !== 'DRAFT' && status !== 'PENDING_REVIEW') {
      throw new BadRequestException(
        'El estado inicial debe ser DRAFT o PENDING_REVIEW. Otros estados se gestionan en el workflow.',
      );
    }

    /* OPS-016 — refuse silent re-uploads when an APPROVED, non-superseded
       document of the same type already exists for this asset. The frontend
       intercepts the 409 to offer the supersession flow; clients that really
       want a parallel new draft can pass forceNewVersion=true. Multipart
       arrives as strings so we accept either truthy form. */
    const force = dto.forceNewVersion === 'true' || (dto.forceNewVersion as unknown) === true;
    if (!force) {
      const existingApproved = await this.prisma.documentRecord.findFirst({
        where: {
          companyId,
          assetId: dto.assetId,
          documentTypeId: dto.documentTypeId,
          status: 'APPROVED',
          isActive: true,
          replacedByDocumentId: null,
        },
        select: { id: true },
      });
      if (existingApproved) {
        throw new ConflictException({
          error: 'DOCUMENT_ALREADY_EXISTS',
          message:
            "Ya existe un documento aprobado de este tipo para este activo. Para reemplazarlo, usa la acción 'Reemplazar versión' desde el documento existente.",
          existingDocumentId: existingApproved.id,
        });
      }
    }

    const issueDate = dto.issueDate ? new Date(dto.issueDate) : null;
    /* Auto-calculate expiration when the user didn't supply one — only when
       the document type expires AND we have an issueDate to anchor on. */
    let expirationDate: Date | null = null;
    if (dto.expirationDate) {
      expirationDate = new Date(dto.expirationDate);
    } else if (documentType.hasExpiration && issueDate && documentType.defaultValidityDays) {
      const exp = new Date(issueDate);
      exp.setDate(exp.getDate() + documentType.defaultValidityDays);
      expirationDate = exp;
    }

    const version = await this.nextVersion(companyId, dto.assetId, dto.documentTypeId);

    const recordId = randomUUID();
    const { filePath: storedPath, fileData: storedData } = await this.storeFile(
      companyId,
      recordId,
      file,
    );

    const created = await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.documentRecord.create({
        data: {
          id: recordId,
          companyId,
          assetId: dto.assetId,
          documentTypeId: dto.documentTypeId,
          fileName: file.originalname,
          mimeType: file.mimetype,
          fileSize: file.size,
          filePath: storedPath,
          fileData: storedData,
          issueDate,
          expirationDate,
          status,
          statusChangedAt: new Date(),
          statusChangedBy: userId,
          uploadedBy: userId,
          version,
          notes: dto.notes,
          isActive: true,
        },
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
        },
      });
    });
    const now = new Date();
    return {
      ...created,
      derivedStatus: this.deriveStatus(
        created.status,
        created.expirationDate,
        created.documentType.alertDaysBefore,
        now,
      ),
    };
  }

  /* OPS-016 — supersede an APPROVED document with a new version. The old row
     becomes immutable (status=REPLACED, replacedByDocumentId set), the new
     row inherits asset+type and bumps version by one. Both writes happen in
     a single transaction so partial failures don't leave the chain broken. */
  async supersedeDocument(
    companyId: string,
    userId: string,
    oldDocumentId: string,
    dto: SupersedeDocumentDto,
    file: Express.Multer.File | undefined,
  ) {
    this.validateFile(file);
    if (!file) throw new BadRequestException('Falta el archivo a cargar.');

    const old = await this.prisma.documentRecord.findFirst({
      where: { id: oldDocumentId, companyId },
      select: {
        id: true,
        assetId: true,
        documentTypeId: true,
        status: true,
        isActive: true,
        replacedByDocumentId: true,
        version: true,
      },
    });
    if (!old) throw new NotFoundException('Documento no encontrado');
    /* Only APPROVED docs can be superseded — drafts/pending/rejected can be
       edited or replaced via the regular flow without breaking compliance. */
    if (old.status !== 'APPROVED') {
      throw new BadRequestException(
        'Solo se pueden reemplazar documentos APROBADOS. Para otros estados, edita o sube un nuevo documento.',
      );
    }
    if (!old.isActive) {
      throw new BadRequestException('No se puede reemplazar un documento inactivo.');
    }
    if (old.replacedByDocumentId) {
      throw new BadRequestException('Este documento ya fue reemplazado por una versión más nueva.');
    }

    const { documentType } = await this.validateRefs(companyId, old.assetId, old.documentTypeId);

    const status: DocumentRecordStatus = dto.setStatus ?? 'DRAFT';
    if (status !== 'DRAFT' && status !== 'PENDING_REVIEW') {
      throw new BadRequestException(
        'El estado inicial debe ser DRAFT o PENDING_REVIEW. Otros estados se gestionan en el workflow.',
      );
    }

    const issueDate = dto.issueDate ? new Date(dto.issueDate) : null;
    let expirationDate: Date | null = null;
    if (dto.expirationDate) {
      expirationDate = new Date(dto.expirationDate);
    } else if (documentType.hasExpiration && issueDate && documentType.defaultValidityDays) {
      const exp = new Date(issueDate);
      exp.setDate(exp.getDate() + documentType.defaultValidityDays);
      expirationDate = exp;
    }

    const version = await this.nextVersion(companyId, old.assetId, old.documentTypeId);

    const newRecordId = randomUUID();
    const { filePath: storedPath, fileData: storedData } = await this.storeFile(
      companyId,
      newRecordId,
      file,
    );

    const now = new Date();
    const result = await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const newRecord = await tx.documentRecord.create({
        data: {
          id: newRecordId,
          companyId,
          assetId: old.assetId,
          documentTypeId: old.documentTypeId,
          fileName: file.originalname,
          mimeType: file.mimetype,
          fileSize: file.size,
          filePath: storedPath,
          fileData: storedData,
          issueDate,
          expirationDate,
          status,
          statusChangedAt: now,
          statusChangedBy: userId,
          uploadedBy: userId,
          version,
          notes: dto.notes,
          isActive: true,
        },
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
        },
      });
      const replaced = await tx.documentRecord.update({
        where: { id: old.id },
        data: {
          status: 'REPLACED',
          replacedByDocumentId: newRecord.id,
          statusReason: `Reemplazado por versión v${version}`,
          statusChangedAt: now,
          statusChangedBy: userId,
          /* isActive stays true so the row remains visible in history. */
        },
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
        },
      });
      return { newRecord, replaced };
    });

    return {
      newDocument: {
        ...result.newRecord,
        derivedStatus: this.deriveStatus(
          result.newRecord.status,
          result.newRecord.expirationDate,
          result.newRecord.documentType.alertDaysBefore,
          now,
        ),
      },
      replacedDocument: {
        ...result.replaced,
        derivedStatus: this.deriveStatus(
          result.replaced.status,
          result.replaced.expirationDate,
          result.replaced.documentType.alertDaysBefore,
          now,
        ),
      },
    };
  }

  /* OPS-016 — version history for one (asset, documentType) pair. Returns
     every record ever created (including REPLACED, ARCHIVED, REJECTED) in
     descending version order, with uploader/approver names hydrated via a
     single batched user lookup. */
  async getVersionHistory(companyId: string, assetId: string, documentTypeId: string) {
    /* Validate refs first so we don't leak existence info across tenants. */
    await this.validateRefs(companyId, assetId, documentTypeId);

    const rows = await this.prisma.documentRecord.findMany({
      where: { companyId, assetId, documentTypeId },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        fileSize: true,
        issueDate: true,
        expirationDate: true,
        status: true,
        statusReason: true,
        statusChangedAt: true,
        version: true,
        uploadedBy: true,
        approvedBy: true,
        approvedAt: true,
        rejectedBy: true,
        rejectedAt: true,
        replacedByDocumentId: true,
        notes: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
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
            color: true,
          },
        },
        asset: {
          select: {
            id: true,
            code: true,
            name: true,
            assetType: { select: { id: true, name: true, category: true } },
          },
        },
      },
      orderBy: { version: 'desc' },
    });

    /* Resolve uploader/approver/rejector users in a single query — same
       pattern used by getPendingReview since DocumentRecord doesn't model
       these as relations. */
    const userIds = new Set<string>();
    for (const r of rows) {
      userIds.add(r.uploadedBy);
      if (r.approvedBy) userIds.add(r.approvedBy);
      if (r.rejectedBy) userIds.add(r.rejectedBy);
    }
    const users = userIds.size
      ? await this.prisma.user.findMany({
          where: { id: { in: Array.from(userIds) } },
          select: { id: true, email: true, firstName: true, lastName: true },
        })
      : [];
    const userById = new Map(users.map((u) => [u.id, u]));

    const now = new Date();
    return rows.map((r) => ({
      ...r,
      derivedStatus: this.deriveStatus(
        r.status,
        r.expirationDate,
        r.documentType.alertDaysBefore,
        now,
      ),
      uploader: userById.get(r.uploadedBy) ?? null,
      approver: r.approvedBy ? (userById.get(r.approvedBy) ?? null) : null,
      rejecter: r.rejectedBy ? (userById.get(r.rejectedBy) ?? null) : null,
    }));
  }

  async update(id: string, companyId: string, userId: string, dto: UpdateDocumentDto) {
    const existing = await this.prisma.documentRecord.findFirst({
      where: { id, companyId },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException('Documento no encontrado');

    /* OPS-016 — REPLACED rows are immutable so the version chain stays a
       reliable audit trail. The same applies to ARCHIVED for the same
       reason. */
    if (existing.status === 'REPLACED') {
      throw new ForbiddenException(
        'No se puede editar un documento reemplazado. La versión vigente es la única editable.',
      );
    }

    /* Workflow transitions live in OPS-015. The only one allowed here is the
       DRAFT → PENDING_REVIEW "submit for review" jump that the upload modal
       uses when the user clicks "Guardar y enviar a revisión" later. */
    if (dto.status !== undefined) {
      if (existing.status !== 'DRAFT' || dto.status !== 'PENDING_REVIEW') {
        throw new BadRequestException(
          'Sólo se permite cambiar el estado de BORRADOR a PENDIENTE_REVISION desde este endpoint.',
        );
      }
    }

    const updated = await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.documentRecord.update({
        where: { id },
        data: {
          ...(dto.issueDate !== undefined
            ? { issueDate: dto.issueDate ? new Date(dto.issueDate) : null }
            : {}),
          ...(dto.expirationDate !== undefined
            ? { expirationDate: dto.expirationDate ? new Date(dto.expirationDate) : null }
            : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          ...(dto.status !== undefined
            ? { status: dto.status, statusChangedAt: new Date(), statusChangedBy: userId }
            : {}),
        },
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
        },
      });
    });

    const now = new Date();
    return {
      ...updated,
      derivedStatus: this.deriveStatus(
        updated.status,
        updated.expirationDate,
        updated.documentType.alertDaysBefore,
        now,
      ),
    };
  }

  /* Soft delete only — preserves audit history. APPROVED documents must be
     archived instead so we don't lose the compliance trail. */
  async remove(id: string, companyId: string, userId: string) {
    const existing = await this.prisma.documentRecord.findFirst({
      where: { id, companyId },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException('Documento no encontrado');
    if (existing.status === 'APPROVED') {
      throw new ForbiddenException(
        'No se puede eliminar un documento APROBADO. Usa archivar en su lugar.',
      );
    }
    if (existing.status === 'REPLACED') {
      throw new ForbiddenException(
        'No se puede eliminar un documento reemplazado: forma parte del historial inmutable.',
      );
    }
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.documentRecord.update({
        where: { id },
        data: { isActive: false },
        select: { id: true, isActive: true },
      });
    });
  }

  async archive(id: string, companyId: string, userId: string, dto: ArchiveDocumentDto) {
    const existing = await this.prisma.documentRecord.findFirst({
      where: { id, companyId },
      select: { id: true, notes: true },
    });
    if (!existing) throw new NotFoundException('Documento no encontrado');

    /* Append rather than overwrite so the original notes survive. The audit
       trigger captures the timestamped trail too — this is the user-visible
       version. */
    const archiveNote = `[Archivado ${new Date().toISOString()}] ${dto.reason}`;
    const mergedNotes = existing.notes ? `${existing.notes}\n\n${archiveNote}` : archiveNote;

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.documentRecord.update({
        where: { id },
        data: {
          status: 'ARCHIVED',
          statusReason: dto.reason,
          statusChangedAt: new Date(),
          statusChangedBy: userId,
          notes: mergedNotes,
          isActive: false,
        },
        select: { id: true, status: true, isActive: true },
      });
    });
  }

  /* Returns the file buffer + meta for streaming back to the user. Honors the
     MinIO-first/DB-blob fallback strategy used on write. */
  async downloadFile(
    id: string,
    companyId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    const row = await this.prisma.documentRecord.findFirst({
      where: { id, companyId },
      select: {
        fileName: true,
        mimeType: true,
        filePath: true,
        fileData: true,
      },
    });
    if (!row) throw new NotFoundException('Documento no encontrado');

    /* DB blob wins when present — it's already in memory, no network hop. */
    if (row.fileData) {
      return {
        buffer: Buffer.from(row.fileData),
        mimeType: row.mimeType,
        fileName: row.fileName,
      };
    }
    if (row.filePath) {
      const buffer = await this.storage.downloadFile(DOCUMENTS_BUCKET, row.filePath);
      return { buffer, mimeType: row.mimeType, fileName: row.fileName };
    }
    throw new NotFoundException('Archivo no disponible.');
  }

  /* Approve a PENDING_REVIEW document. Self-approval is blocked at the
     service layer so the rule holds even if a frontend slips through —
     CASL gates the role, this gates the per-row identity. */
  async approve(id: string, companyId: string, userId: string) {
    const existing = await this.prisma.documentRecord.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        status: true,
        uploadedBy: true,
        documentTypeId: true,
        assetId: true,
      },
    });
    if (!existing) throw new NotFoundException('Documento no encontrado');
    if (existing.status !== 'PENDING_REVIEW') {
      throw new BadRequestException(
        'Solo se pueden aprobar documentos en estado PENDIENTE_REVISION',
      );
    }
    if (existing.uploadedBy === userId) {
      throw new ForbiddenException('No puedes aprobar un documento que tú mismo cargaste');
    }
    const now = new Date();
    const approved = await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const updated = await tx.documentRecord.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedBy: userId,
          approvedAt: now,
          /* Clear the rejection trail in case this doc cycled through reject
             → resubmit → approve. We don't lose history because the audit
             trigger captured every state change. */
          rejectedBy: null,
          rejectedAt: null,
          statusReason: null,
          statusChangedAt: now,
          statusChangedBy: userId,
        },
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
        },
      });
      return {
        ...updated,
        derivedStatus: this.deriveStatus(
          updated.status,
          updated.expirationDate,
          updated.documentType.alertDaysBefore,
          now,
        ),
      };
    });

    /* OPS-020 — re-evaluate the asset's blocking state now that a
       fresh APPROVED row exists. If the asset was BLOCKED_DOCUMENTAL
       only because this doc was missing/expired, the call flips it
       back to OPERATIONAL with an AUTO_UNBLOCK audit row. Errors here
       don't fail the approval — the next cron pass will catch up. */
    try {
      await this.blockingService.processBlocking(companyId, existing.assetId, userId);
    } catch (err) {
      this.logger.warn(
        `Blocking re-evaluation after approve failed (doc ${id}): ${
          err instanceof Error ? err.message : err
        }`,
      );
    }

    return approved;
  }

  async reject(id: string, companyId: string, userId: string, dto: RejectDocumentDto) {
    const existing = await this.prisma.documentRecord.findFirst({
      where: { id, companyId },
      select: { id: true, status: true, uploadedBy: true },
    });
    if (!existing) throw new NotFoundException('Documento no encontrado');
    if (existing.status !== 'PENDING_REVIEW') {
      throw new BadRequestException(
        'Solo se pueden rechazar documentos en estado PENDIENTE_REVISION',
      );
    }
    if (existing.uploadedBy === userId) {
      throw new ForbiddenException('No puedes rechazar un documento que tú mismo cargaste');
    }
    const now = new Date();
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const updated = await tx.documentRecord.update({
        where: { id },
        data: {
          status: 'REJECTED',
          rejectedBy: userId,
          rejectedAt: now,
          statusReason: dto.reason,
          statusChangedAt: now,
          statusChangedBy: userId,
        },
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
        },
      });
      return {
        ...updated,
        derivedStatus: this.deriveStatus(
          updated.status,
          updated.expirationDate,
          updated.documentType.alertDaysBefore,
          now,
        ),
      };
    });
  }

  /* Resubmit a REJECTED document for review. Restricted to the original
     uploader — anyone else trying to resubmit gets a 403 even if CASL lets
     them past the controller guard. */
  async resubmit(id: string, companyId: string, userId: string) {
    const existing = await this.prisma.documentRecord.findFirst({
      where: { id, companyId },
      select: { id: true, status: true, uploadedBy: true },
    });
    if (!existing) throw new NotFoundException('Documento no encontrado');
    if (existing.status !== 'REJECTED') {
      throw new BadRequestException(
        'Solo se pueden reenviar a revisión documentos en estado RECHAZADO',
      );
    }
    if (existing.uploadedBy !== userId) {
      throw new ForbiddenException(
        'Solo el usuario que cargó el documento puede reenviarlo a revisión',
      );
    }
    const now = new Date();
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const updated = await tx.documentRecord.update({
        where: { id },
        data: {
          status: 'PENDING_REVIEW',
          rejectedBy: null,
          rejectedAt: null,
          statusReason: null,
          statusChangedAt: now,
          statusChangedBy: userId,
        },
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
        },
      });
      return {
        ...updated,
        derivedStatus: this.deriveStatus(
          updated.status,
          updated.expirationDate,
          updated.documentType.alertDaysBefore,
          now,
        ),
      };
    });
  }

  /* Paginated list of PENDING_REVIEW documents, oldest first so reviewers
     work the queue FIFO. Includes the uploader's user record so the UI can
     warn "you uploaded this — you can't approve". */
  async getPendingReview(companyId: string, filters: FilterPendingReviewDto) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, filters.limit ?? DEFAULT_LIMIT));
    const skip = (page - 1) * limit;

    const where: Prisma.DocumentRecordWhereInput = {
      companyId,
      isActive: true,
      status: 'PENDING_REVIEW',
    };
    if (filters.assetId) where.assetId = filters.assetId;
    if (filters.documentTypeId) where.documentTypeId = filters.documentTypeId;
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
          version: true,
          uploadedBy: true,
          createdAt: true,
          updatedAt: true,
          notes: true,
          asset: {
            select: {
              id: true,
              code: true,
              name: true,
              assetType: { select: { id: true, name: true, category: true } },
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
        /* Oldest first so reviewers work through the backlog without docs
           rotting at the bottom of the list. */
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.documentRecord.count({ where }),
    ]);

    /* Attach uploader user info via a single batched lookup — same pattern
       as AssetsService.findOne since DocumentRecord stores uploadedBy as a
       bare UUID without a Prisma relation. */
    const userIds = Array.from(new Set(rows.map((r) => r.uploadedBy)));
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true, firstName: true, lastName: true },
        })
      : [];
    const userById = new Map(users.map((u) => [u.id, u]));
    const now = new Date();
    const data = rows.map((r) => ({
      ...r,
      derivedStatus: this.deriveStatus(
        r.status,
        r.expirationDate,
        r.documentType.alertDaysBefore,
        now,
      ),
      uploader: userById.get(r.uploadedBy) ?? null,
    }));

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getPendingReviewCount(companyId: string) {
    const count = await this.prisma.documentRecord.count({
      where: { companyId, isActive: true, status: 'PENDING_REVIEW' },
    });
    return { count };
  }

  /* OPS-017 — consolidated "carpeta documental" view for one asset.
     Returns the asset, full compliance breakdown, the per-requirement
     state, and any uploaded docs that fall outside the requirements
     matrix. The caller can render this directly without further joins. */
  async getAssetFolder(companyId: string, assetId: string) {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const asset = await this.prisma.operationalAsset.findFirst({
      where: { id: assetId, companyId },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        status: true,
        statusReason: true,
        statusChangedAt: true,
        assetTypeId: true,
        assetSubtypeId: true,
        locationId: true,
        tags: true,
        createdAt: true,
        updatedAt: true,
        assetType: {
          select: { id: true, name: true, category: true, color: true },
        },
        assetSubtype: { select: { id: true, name: true } },
        location: {
          select: { id: true, name: true, code: true, address: true },
        },
      },
    });
    if (!asset) throw new NotFoundException('Activo no encontrado');

    const [requirements, allDocuments] = await Promise.all([
      this.requirementsService.resolveRequirementsForAsset(companyId, assetId),
      /* Pull every document for this asset (any status, isActive=true) so we
         can both pick the latest per (assetId, documentTypeId) AND surface
         additional uploads that aren't in the requirements matrix. */
      this.prisma.documentRecord.findMany({
        where: { companyId, assetId, isActive: true },
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
          replacedByDocumentId: true,
          createdAt: true,
          updatedAt: true,
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
        orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);

    /* Per (documentTypeId) pick the row that should drive compliance.
       APPROVED + non-superseded wins; otherwise we fall back to the
       newest non-REPLACED row (so the UI can show PENDING_REVIEW or
       REJECTED in lieu of "missing" when something is uploaded). */
    const latestApprovedByType = new Map<string, (typeof allDocuments)[number]>();
    const latestAnyByType = new Map<string, (typeof allDocuments)[number]>();
    for (const d of allDocuments) {
      if (d.status === 'REPLACED') continue;
      if (!latestAnyByType.has(d.documentTypeId)) {
        latestAnyByType.set(d.documentTypeId, d);
      }
      if (
        d.status === 'APPROVED' &&
        d.replacedByDocumentId === null &&
        !latestApprovedByType.has(d.documentTypeId)
      ) {
        latestApprovedByType.set(d.documentTypeId, d);
      }
    }

    /* Folder-specific derived state: same enum as deriveStatus but with
       the additional 'FALTANTE' state used only by compliance views. */
    type FolderState =
      | 'VIGENTE'
      | 'POR_VENCER'
      | 'VENCIDO'
      | 'FALTANTE'
      | 'PENDIENTE_REVISION'
      | 'RECHAZADO'
      | 'BORRADOR';

    let totalRequired = 0;
    let valid = 0;
    let expiringSoon = 0;
    let expired = 0;
    let missing = 0;
    let pendingReview = 0;
    let rejected = 0;
    const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };

    const requiredDocuments = requirements.map((req) => {
      totalRequired++;
      const approved = latestApprovedByType.get(req.documentTypeId);
      const fallback = latestAnyByType.get(req.documentTypeId);
      const latest = approved ?? fallback ?? null;

      let folderState: FolderState;
      let daysUntilExpiration: number | null = null;
      if (approved) {
        if (approved.expirationDate) {
          const exp = new Date(approved.expirationDate);
          daysUntilExpiration = Math.floor((exp.getTime() - today.getTime()) / 86400000);
          if (daysUntilExpiration < 0) {
            folderState = 'VENCIDO';
            expired++;
          } else if (daysUntilExpiration <= req.documentType.alertDaysBefore) {
            folderState = 'POR_VENCER';
            expiringSoon++;
          } else {
            folderState = 'VIGENTE';
            valid++;
          }
        } else {
          folderState = 'VIGENTE';
          valid++;
        }
      } else if (fallback) {
        if (fallback.status === 'PENDING_REVIEW') {
          folderState = 'PENDIENTE_REVISION';
          pendingReview++;
        } else if (fallback.status === 'REJECTED') {
          folderState = 'RECHAZADO';
          rejected++;
        } else {
          /* DRAFT / ARCHIVED — count toward "missing" for compliance since
             they aren't approved. The UI still shows the existing draft so
             the operator knows there's something in flight. */
          folderState = fallback.status === 'DRAFT' ? 'BORRADOR' : 'FALTANTE';
          missing++;
        }
      } else {
        folderState = 'FALTANTE';
        missing++;
      }

      /* Severity tally — counted only for problem rows so the UI can warn
         about CRITICAL gaps that block operation. */
      const isProblem =
        folderState === 'FALTANTE' || folderState === 'VENCIDO' || folderState === 'RECHAZADO';
      if (isProblem) {
        const sev = req.documentType.criticality.toLowerCase() as keyof typeof bySeverity;
        bySeverity[sev]++;
      }

      const enrichedLatest = latest
        ? {
            ...latest,
            derivedStatus: this.deriveStatus(
              latest.status,
              latest.expirationDate,
              latest.documentType.alertDaysBefore,
              now,
            ),
          }
        : null;

      return {
        documentType: req.documentType,
        latestRecord: enrichedLatest,
        derivedStatus: folderState,
        daysUntilExpiration,
        resolvedFrom: req.resolvedFrom,
        isMandatory: req.isMandatory ?? true,
      };
    });

    /* Additional documents — uploaded rows whose documentTypeId isn't in
       the requirements matrix. Useful for ad-hoc certificates, attached
       PDFs, etc. Only the latest per type is shown (mirroring the
       compliance grouping). */
    const requiredTypeIds = new Set(requirements.map((r) => r.documentTypeId));
    const additionalDocuments = Array.from(latestAnyByType.values())
      .filter((d) => !requiredTypeIds.has(d.documentTypeId))
      .map((d) => ({
        ...d,
        derivedStatus: this.deriveStatus(
          d.status,
          d.expirationDate,
          d.documentType.alertDaysBefore,
          now,
        ),
      }));

    const compliancePercentage =
      totalRequired === 0 ? 100 : Math.round(((valid + expiringSoon) / totalRequired) * 1000) / 10;

    return {
      asset,
      compliance: {
        totalRequired,
        valid,
        expiringSoon,
        expired,
        missing,
        pendingReview,
        rejected,
        compliancePercentage,
        bySeverity,
      },
      requiredDocuments,
      additionalDocuments,
      generatedAt: now.toISOString(),
    };
  }

  /* OPS-017 — same folder shape but with the file buffer and storage path
     for every "current approved" document, ready to be ZIPped by the
     export endpoint. We don't fold this into getAssetFolder() because the
     binary fetch is significantly more expensive and pointless for the
     view-only call. */
  async getAssetFolderExport(companyId: string, assetId: string) {
    const folder = await this.getAssetFolder(companyId, assetId);

    /* The exportable set is the latest APPROVED, non-replaced doc per
       required documentType — plus any additional approved docs. Drafts,
       rejects and replaced rows are intentionally excluded. */
    const exportableRecords: Array<{
      documentTypeCode: string;
      fileName: string;
      mimeType: string;
      buffer: Buffer;
    }> = [];

    const approvedRequiredDocs = folder.requiredDocuments
      .map((r) => r.latestRecord)
      .filter((r): r is NonNullable<typeof r> => r !== null && r.status === 'APPROVED');
    const approvedAdditionalDocs = folder.additionalDocuments.filter(
      (d) => d.status === 'APPROVED',
    );

    const allApproved = [...approvedRequiredDocs, ...approvedAdditionalDocs];
    /* Dedup by id — a doc could appear in both buckets if compliance and
       additional use the same record (shouldn't happen, but guard
       anyway). */
    const seen = new Set<string>();
    for (const rec of allApproved) {
      if (seen.has(rec.id)) continue;
      seen.add(rec.id);
      try {
        const file = await this.downloadFile(rec.id, companyId);
        exportableRecords.push({
          documentTypeCode: rec.documentType.code,
          fileName: file.fileName,
          mimeType: file.mimeType,
          buffer: file.buffer,
        });
      } catch (err) {
        /* A missing/unavailable file shouldn't kill the whole export — log
           and skip so the operator still gets the rest of the bundle. */
        this.logger.warn(
          `Failed to fetch document ${rec.id} for ZIP export: ${
            err instanceof Error ? err.message : err
          }`,
        );
      }
    }

    return { folder, files: exportableRecords };
  }
}
