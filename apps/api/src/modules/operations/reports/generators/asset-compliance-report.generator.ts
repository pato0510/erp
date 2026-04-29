import { Injectable } from '@nestjs/common';
import { DocumentCriticality, Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  addCompanyFooter,
  addCompanyHeader,
  applyConditionalColor,
  applyHeaderStyle,
  autoSizeColumns,
  compliancePctTone,
  formatDateColumn,
  formatPercentColumn,
  freezeHeader,
  newWorkbook,
} from '../excel-helpers';
import type { AssetComplianceFilters } from '../dto/report-filter.dto';

interface RequirementRef {
  documentTypeId: string;
  alertDaysBefore: number;
  criticality: DocumentCriticality;
  documentTypeName: string;
  documentTypeCode: string;
}

interface PerAssetRow {
  asset: {
    id: string;
    code: string;
    name: string;
    status: string;
    type: string;
    location: string | null;
  };
  totalRequired: number;
  valid: number;
  expiringSoon: number;
  expired: number;
  missing: number;
  compliancePercentage: number;
  blocked: boolean;
  /* The folded list of requirements + their currently-known APPROVED
     record (if any). Used to populate the per-document sheet. */
  documentRows: Array<{
    requirement: RequirementRef;
    state: 'VALID' | 'EXPIRING_SOON' | 'EXPIRED' | 'MISSING';
    daysRemaining: number | null;
    record: {
      version: number;
      issueDate: Date | null;
      expirationDate: Date | null;
      approvedBy: string | null;
      approvedAt: Date | null;
    } | null;
  }>;
}

@Injectable()
export class AssetComplianceReportGenerator {
  constructor(private readonly prisma: PrismaService) {}

  async fetchData(companyId: string, filters: AssetComplianceFilters) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, taxId: true },
    });

    const assetWhere: Prisma.OperationalAssetWhereInput = {
      companyId,
      isActive: true,
    };
    if (filters.assetTypeId) assetWhere.assetTypeId = filters.assetTypeId;
    if (filters.locationId) assetWhere.locationId = filters.locationId;
    if (filters.status) assetWhere.status = filters.status as Prisma.EnumAssetStatusFilter;
    if (filters.blockedOnly) assetWhere.status = 'BLOCKED_DOCUMENTAL';

    const [assets, requirements, latestRecords] = await Promise.all([
      this.prisma.operationalAsset.findMany({
        where: assetWhere,
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          assetTypeId: true,
          assetSubtypeId: true,
          assetType: { select: { name: true } },
          location: { select: { name: true } },
        },
        orderBy: { code: 'asc' },
      }),
      this.prisma.documentRequirement.findMany({
        where: { companyId },
        select: {
          documentTypeId: true,
          assetTypeId: true,
          assetSubtypeId: true,
          assetId: true,
          documentType: {
            select: {
              id: true,
              code: true,
              name: true,
              alertDaysBefore: true,
              criticality: true,
              blocksOperation: true,
            },
          },
        },
      }),
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
          version: true,
          issueDate: true,
          expirationDate: true,
          approvedBy: true,
          approvedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    /* Bucket requirements like getCompliance() does — most-specific
       wins (asset > subtype > type). */
    const byAsset = new Map<string, RequirementRef[]>();
    const bySubtype = new Map<string, RequirementRef[]>();
    const byType = new Map<string, RequirementRef[]>();
    for (const r of requirements) {
      const entry: RequirementRef = {
        documentTypeId: r.documentTypeId,
        alertDaysBefore: r.documentType.alertDaysBefore,
        criticality: r.documentType.criticality,
        documentTypeName: r.documentType.name,
        documentTypeCode: r.documentType.code,
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

    /* (assetId, documentTypeId) → latest APPROVED record. */
    const latestByPair = new Map<
      string,
      {
        version: number;
        issueDate: Date | null;
        expirationDate: Date | null;
        approvedBy: string | null;
        approvedAt: Date | null;
      }
    >();
    for (const rec of latestRecords) {
      const key = `${rec.assetId}::${rec.documentTypeId}`;
      if (!latestByPair.has(key)) {
        latestByPair.set(key, {
          version: rec.version,
          issueDate: rec.issueDate,
          expirationDate: rec.expirationDate,
          approvedBy: rec.approvedBy,
          approvedAt: rec.approvedAt,
        });
      }
    }

    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const perAsset: PerAssetRow[] = assets.map((asset) => {
      /* Most-specific-wins merge per asset. */
      const merged = new Map<string, RequirementRef>();
      for (const r of byType.get(asset.assetTypeId) ?? []) merged.set(r.documentTypeId, r);
      if (asset.assetSubtypeId) {
        for (const r of bySubtype.get(asset.assetSubtypeId) ?? []) {
          merged.set(r.documentTypeId, r);
        }
      }
      for (const r of byAsset.get(asset.id) ?? []) merged.set(r.documentTypeId, r);

      let valid = 0;
      let expiringSoon = 0;
      let expired = 0;
      let missing = 0;
      const documentRows: PerAssetRow['documentRows'] = [];
      for (const req of merged.values()) {
        const rec = latestByPair.get(`${asset.id}::${req.documentTypeId}`) ?? null;
        let state: 'VALID' | 'EXPIRING_SOON' | 'EXPIRED' | 'MISSING';
        let days: number | null = null;
        if (!rec) {
          state = 'MISSING';
          missing++;
        } else if (rec.expirationDate && rec.expirationDate < today) {
          state = 'EXPIRED';
          expired++;
          days = Math.floor((rec.expirationDate.getTime() - today.getTime()) / 86_400_000);
        } else if (rec.expirationDate) {
          days = Math.floor((rec.expirationDate.getTime() - today.getTime()) / 86_400_000);
          if (days <= req.alertDaysBefore) {
            state = 'EXPIRING_SOON';
            expiringSoon++;
          } else {
            state = 'VALID';
            valid++;
          }
        } else {
          state = 'VALID';
          valid++;
        }
        documentRows.push({ requirement: req, state, daysRemaining: days, record: rec });
      }
      const total = merged.size;
      const compliancePercentage =
        total === 0 ? 100 : Math.round(((valid + expiringSoon) / total) * 1000) / 10;

      return {
        asset: {
          id: asset.id,
          code: asset.code,
          name: asset.name,
          status: asset.status,
          type: asset.assetType?.name ?? '—',
          location: asset.location?.name ?? null,
        },
        totalRequired: total,
        valid,
        expiringSoon,
        expired,
        missing,
        compliancePercentage,
        blocked: asset.status === 'BLOCKED_DOCUMENTAL',
        documentRows,
      };
    });

    /* Resolve approver names in a single batched lookup so the
       per-doc sheet shows "Juan P." instead of a UUID. */
    const userIds = Array.from(
      new Set(
        perAsset.flatMap((p) =>
          p.documentRows.map((d) => d.record?.approvedBy).filter((v): v is string => !!v),
        ),
      ),
    );
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const userById = new Map(users.map((u) => [u.id, u]));

    /* Aggregate stats for the executive summary. */
    const totalDocs = perAsset.reduce((s, p) => s + p.totalRequired, 0);
    const totalValid = perAsset.reduce((s, p) => s + p.valid + p.expiringSoon, 0);
    const compliancePct = totalDocs === 0 ? 100 : Math.round((totalValid / totalDocs) * 1000) / 10;
    const blockedCount = perAsset.filter((p) => p.blocked).length;

    const top10 = [...perAsset]
      .filter((p) => p.totalRequired > 0)
      .sort((a, b) => a.compliancePercentage - b.compliancePercentage)
      .slice(0, 10);

    return {
      company: company ?? { name: '—', taxId: null },
      perAsset,
      userById,
      totals: {
        assetCount: perAsset.length,
        totalDocs,
        compliancePercentage: compliancePct,
        blockedCount,
      },
      top10,
    };
  }

  async generateExcel(companyId: string, filters: AssetComplianceFilters): Promise<Buffer> {
    const data = await this.fetchData(companyId, filters);
    const wb = newWorkbook();

    /* ----- Sheet 1 — Resumen ejecutivo ----- */
    const ws1 = wb.addWorksheet('Resumen ejecutivo');
    addCompanyHeader(ws1, {
      company: data.company,
      reportTitle: 'Cumplimiento documental por activo',
      columns: 4,
    });
    ws1.addRow(['Activos analizados', data.totals.assetCount]);
    ws1.addRow(['Documentos requeridos', data.totals.totalDocs]);
    const pctRow = ws1.addRow(['Cumplimiento global', data.totals.compliancePercentage]);
    pctRow.getCell(2).numFmt = '0.0"%"';
    applyConditionalColor(pctRow.getCell(2), compliancePctTone(data.totals.compliancePercentage));
    ws1.addRow(['Activos bloqueados', data.totals.blockedCount]);
    ws1.addRow([]);
    ws1.addRow(['Top 10 activos en riesgo']).font = { bold: true, size: 12 };
    const topHeaderRow = ws1.addRow([
      'Código',
      'Nombre',
      'Cumplimiento %',
      'Vencidos',
      'Faltantes',
    ]);
    applyHeaderStyle(ws1, topHeaderRow.number);
    for (const p of data.top10) {
      const row = ws1.addRow([
        p.asset.code,
        p.asset.name,
        p.compliancePercentage,
        p.expired,
        p.missing,
      ]);
      row.getCell(3).numFmt = '0.0"%"';
      applyConditionalColor(row.getCell(3), compliancePctTone(p.compliancePercentage));
    }
    ws1.getColumn(1).width = 18;
    ws1.getColumn(2).width = 32;
    ws1.getColumn(3).width = 18;
    ws1.getColumn(4).width = 12;
    ws1.getColumn(5).width = 12;
    addCompanyFooter(ws1, { generatedAt: new Date(), columns: 5 });

    /* ----- Sheet 2 — Detalle por activo ----- */
    const ws2 = wb.addWorksheet('Detalle por activo');
    ws2.columns = [
      { header: 'Código', key: 'code', width: 18 },
      { header: 'Nombre', key: 'name', width: 30 },
      { header: 'Tipo', key: 'type', width: 18 },
      { header: 'Ubicación', key: 'location', width: 20 },
      { header: 'Estado', key: 'status', width: 18 },
      { header: 'Total docs', key: 'total', width: 12 },
      { header: 'Vigentes', key: 'valid', width: 11 },
      { header: 'Por vencer', key: 'expiringSoon', width: 12 },
      { header: 'Vencidos', key: 'expired', width: 11 },
      { header: 'Faltantes', key: 'missing', width: 11 },
      { header: 'Cumplimiento %', key: 'pct', width: 16 },
      { header: 'Bloqueado', key: 'blocked', width: 12 },
    ];
    applyHeaderStyle(ws2, 1);
    freezeHeader(ws2, 1);
    formatPercentColumn(ws2, 'K');
    for (const p of data.perAsset) {
      const row = ws2.addRow({
        code: p.asset.code,
        name: p.asset.name,
        type: p.asset.type,
        location: p.asset.location ?? '',
        status: p.asset.status,
        total: p.totalRequired,
        valid: p.valid,
        expiringSoon: p.expiringSoon,
        expired: p.expired,
        missing: p.missing,
        pct: p.compliancePercentage,
        blocked: p.blocked ? 'Sí' : '',
      });
      applyConditionalColor(row.getCell('K'), compliancePctTone(p.compliancePercentage));
      if (p.blocked) {
        row.getCell('L').font = { bold: true, color: { argb: '991B1B' } };
      }
    }

    /* ----- Sheet 3 — Documentos por activo ----- */
    const ws3 = wb.addWorksheet('Documentos por activo');
    ws3.columns = [
      { header: 'Activo', key: 'asset', width: 18 },
      { header: 'Tipo doc', key: 'docType', width: 28 },
      { header: 'Estado', key: 'state', width: 14 },
      { header: 'Versión', key: 'version', width: 9 },
      { header: 'Emisión', key: 'issueDate', width: 12 },
      { header: 'Vencimiento', key: 'expiration', width: 12 },
      { header: 'Días restantes', key: 'days', width: 14 },
      { header: 'Aprobado por', key: 'approvedBy', width: 22 },
      { header: 'Aprobado en', key: 'approvedAt', width: 14 },
      { header: 'Crítico', key: 'critical', width: 9 },
    ];
    applyHeaderStyle(ws3, 1);
    freezeHeader(ws3, 1);
    formatDateColumn(ws3, 'E');
    formatDateColumn(ws3, 'F');
    formatDateColumn(ws3, 'I');
    for (const p of data.perAsset) {
      for (const d of p.documentRows) {
        const approver = d.record?.approvedBy ? data.userById.get(d.record.approvedBy) : null;
        const row = ws3.addRow({
          asset: p.asset.code,
          docType: d.requirement.documentTypeName,
          state: this.stateLabel(d.state),
          version: d.record?.version ?? '',
          issueDate: d.record?.issueDate ?? '',
          expiration: d.record?.expirationDate ?? '',
          days: d.daysRemaining ?? '',
          approvedBy: approver
            ? `${approver.firstName} ${approver.lastName}`.trim() || approver.email
            : '',
          approvedAt: d.record?.approvedAt ?? '',
          critical: d.requirement.criticality === 'CRITICAL' ? 'Sí' : '',
        });
        if (d.state === 'EXPIRED' || d.state === 'MISSING') {
          row.getCell('C').fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FEE2E2' },
          };
          row.getCell('C').font = { bold: true, color: { argb: '991B1B' } };
        } else if (d.state === 'EXPIRING_SOON') {
          row.getCell('C').fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FEF3C7' },
          };
          row.getCell('C').font = { bold: true, color: { argb: '92400E' } };
        }
      }
    }
    autoSizeColumns(ws3);

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async generatePreview(companyId: string, filters: AssetComplianceFilters) {
    const data = await this.fetchData(companyId, filters);
    return {
      summary: {
        rowCount: data.perAsset.length,
        compliancePercentage: data.totals.compliancePercentage,
        totalDocs: data.totals.totalDocs,
        blockedCount: data.totals.blockedCount,
      },
      columns: ['Código', 'Nombre', 'Tipo', 'Estado', 'Cumplimiento %', 'Vencidos', 'Faltantes'],
      rows: data.perAsset.slice(0, 10).map((p) => ({
        code: p.asset.code,
        name: p.asset.name,
        type: p.asset.type,
        status: p.asset.status,
        compliancePercentage: p.compliancePercentage,
        expired: p.expired,
        missing: p.missing,
      })),
    };
  }

  private stateLabel(state: 'VALID' | 'EXPIRING_SOON' | 'EXPIRED' | 'MISSING'): string {
    switch (state) {
      case 'VALID':
        return 'Vigente';
      case 'EXPIRING_SOON':
        return 'Por vencer';
      case 'EXPIRED':
        return 'Vencido';
      case 'MISSING':
        return 'Faltante';
    }
  }
}
