import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  addCompanyFooter,
  addCompanyHeader,
  applyHeaderStyle,
  freezeHeader,
  newWorkbook,
} from '../../reports/excel-helpers';

/* OPS-036 (report 06) — chronological audit log of asset status
   transitions. Pulled from the `asset_status_changes` table that
   the asset-blocking service writes to on every MANUAL or AUTO_*
   change. The triggering documents/alerts are surfaced as id
   arrays so an auditor can cross-reference them with reports 01
   and 04. */

export interface AssetStatusChangesFilters {
  startDate: string;
  endDate: string;
  changeType?: 'MANUAL' | 'AUTO_BLOCK' | 'AUTO_UNBLOCK' | 'EXCEPTION_GRANTED' | 'EXCEPTION_EXPIRED';
}

@Injectable()
export class AssetStatusChangesReportGenerator {
  constructor(private readonly prisma: PrismaService) {}

  async fetchData(companyId: string, filters: AssetStatusChangesFilters) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, taxId: true },
    });

    const where: Prisma.AssetStatusChangeWhereInput = {
      companyId,
      createdAt: {
        gte: new Date(filters.startDate),
        lte: new Date(filters.endDate),
      },
    };
    if (filters.changeType) where.changeType = filters.changeType;

    const changes = await this.prisma.assetStatusChange.findMany({
      where,
      select: {
        id: true,
        previousStatus: true,
        newStatus: true,
        changeType: true,
        reason: true,
        changedBy: true,
        triggeringDocumentTypeIds: true,
        triggeringAlertInstanceIds: true,
        createdAt: true,
        asset: { select: { id: true, code: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    /* Resolve actor names — auto changes have no `changedBy`. */
    const userIds = new Set<string>();
    for (const c of changes) if (c.changedBy) userIds.add(c.changedBy);
    const users = userIds.size
      ? await this.prisma.user.findMany({
          where: { id: { in: Array.from(userIds) } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const userById = new Map(users.map((u) => [u.id, u]));
    const userName = (id: string | null) => {
      if (!id) return 'Sistema';
      const u = userById.get(id);
      if (!u) return id;
      return `${u.firstName} ${u.lastName}`.trim() || u.email;
    };

    /* Aggregates */
    const byChangeType: Record<string, number> = {};
    for (const c of changes) byChangeType[c.changeType] = (byChangeType[c.changeType] ?? 0) + 1;

    /* Top 10 assets by change count — surfaces the assets whose
       state churns most, often a flag for systemic blocking issues. */
    const byAsset = new Map<string, { code: string; name: string; count: number }>();
    for (const c of changes) {
      if (!c.asset) continue;
      const slot = byAsset.get(c.asset.id) ?? { code: c.asset.code, name: c.asset.name, count: 0 };
      slot.count++;
      byAsset.set(c.asset.id, slot);
    }
    const topAssets = Array.from(byAsset.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      company: company ?? { name: '—', taxId: null },
      changes,
      byChangeType,
      topAssets,
      userName,
    };
  }

  async generateExcel(companyId: string, filters: AssetStatusChangesFilters): Promise<Buffer> {
    const data = await this.fetchData(companyId, filters);
    const wb = newWorkbook();

    /* ----- Sheet 1 — Resumen ----- */
    const ws1 = wb.addWorksheet('Resumen');
    addCompanyHeader(ws1, {
      company: data.company,
      reportTitle: 'Cambios de estado de activos',
      dateRange: { from: filters.startDate.slice(0, 10), to: filters.endDate.slice(0, 10) },
      columns: 3,
    });
    ws1.addRow(['Total de cambios en el período', data.changes.length]);
    ws1.addRow([]);
    const typeHeader = ws1.addRow(['Tipo de cambio', 'Cantidad']);
    applyHeaderStyle(ws1, typeHeader.number);
    for (const t of [
      'MANUAL',
      'AUTO_BLOCK',
      'AUTO_UNBLOCK',
      'EXCEPTION_GRANTED',
      'EXCEPTION_EXPIRED',
    ]) {
      ws1.addRow([t, data.byChangeType[t] ?? 0]);
    }
    ws1.addRow([]);
    const topTitle = ws1.addRow(['Top 10 activos con más cambios', '', '']);
    topTitle.font = { bold: true, size: 12 };
    const topHeader = ws1.addRow(['Código', 'Nombre', 'Cambios']);
    applyHeaderStyle(ws1, topHeader.number);
    for (const t of data.topAssets) ws1.addRow([t.code, t.name, t.count]);
    ws1.getColumn(1).width = 32;
    ws1.getColumn(2).width = 38;
    ws1.getColumn(3).width = 12;
    addCompanyFooter(ws1, { generatedAt: new Date(), columns: 3 });

    /* ----- Sheet 2 — Detalle cronológico ----- */
    const ws2 = wb.addWorksheet('Detalle cronológico');
    addCompanyHeader(ws2, {
      company: data.company,
      reportTitle: 'Detalle cronológico de cambios',
      dateRange: { from: filters.startDate.slice(0, 10), to: filters.endDate.slice(0, 10) },
      columns: 9,
    });
    const headerRow = ws2.addRow([
      'Fecha',
      'Activo (código)',
      'Activo (nombre)',
      'Estado anterior',
      'Estado nuevo',
      'Tipo de cambio',
      'Razón',
      'Cambiado por',
      'IDs de origen (documentos / alertas)',
    ]);
    applyHeaderStyle(ws2, headerRow.number);
    freezeHeader(ws2, headerRow.number);
    for (const c of data.changes) {
      /* Surface the trigger ids so auditors can cross-reference
         the documents / alerts that caused an auto-change. We
         don't try to resolve them to names here — the docs report
         (01) and alerts report (04) already do that. */
      const triggers: string[] = [];
      if (c.triggeringDocumentTypeIds.length) {
        triggers.push(`docs: ${c.triggeringDocumentTypeIds.join(',')}`);
      }
      if (c.triggeringAlertInstanceIds.length) {
        triggers.push(`alerts: ${c.triggeringAlertInstanceIds.join(',')}`);
      }
      ws2.addRow([
        c.createdAt,
        c.asset?.code ?? '—',
        c.asset?.name ?? '—',
        c.previousStatus,
        c.newStatus,
        c.changeType,
        c.reason ?? '',
        data.userName(c.changedBy),
        triggers.join(' | '),
      ]);
    }
    ws2.getColumn('A').numFmt = 'dd-mm-yyyy hh:mm';
    addCompanyFooter(ws2, { generatedAt: new Date(), columns: 9 });

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }
}
