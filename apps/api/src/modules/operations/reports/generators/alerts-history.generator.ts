import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  addCompanyFooter,
  addCompanyHeader,
  applyHeaderStyle,
  freezeHeader,
  newWorkbook,
} from '../excel-helpers';
import type { AlertsHistoryFilters } from '../dto/report-filter.dto';

@Injectable()
export class AlertsHistoryReportGenerator {
  constructor(private readonly prisma: PrismaService) {}

  async fetchData(companyId: string, filters: AlertsHistoryFilters) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, taxId: true },
    });

    const where: Prisma.AlertInstanceWhereInput = {
      companyId,
      triggeredAt: { gte: new Date(filters.startDate), lte: new Date(filters.endDate) },
    };
    if (filters.severity) where.severity = filters.severity;
    if (filters.status) where.status = filters.status;
    if (filters.assetId) where.assetId = filters.assetId;

    const alerts = await this.prisma.alertInstance.findMany({
      where,
      select: {
        id: true,
        title: true,
        severity: true,
        status: true,
        triggerType: true,
        triggeredAt: true,
        acknowledgedAt: true,
        acknowledgedBy: true,
        resolvedAt: true,
        resolvedBy: true,
        asset: { select: { id: true, code: true, name: true } },
        documentType: { select: { name: true, code: true } },
      },
      orderBy: { triggeredAt: 'desc' },
    });

    /* Resolve names. */
    const userIds = new Set<string>();
    for (const a of alerts) {
      if (a.acknowledgedBy) userIds.add(a.acknowledgedBy);
      if (a.resolvedBy) userIds.add(a.resolvedBy);
    }
    const users = userIds.size
      ? await this.prisma.user.findMany({
          where: { id: { in: Array.from(userIds) } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const userById = new Map(users.map((u) => [u.id, u]));
    const userName = (id: string | null) => {
      if (!id) return '—';
      const u = userById.get(id);
      if (!u) return id;
      return `${u.firstName} ${u.lastName}`.trim() || u.email;
    };

    /* Stats. Resolution time = resolvedAt - triggeredAt for resolved
       alerts. Average is in minutes for human-readability. */
    const bySeverity: Record<string, number> = {};
    for (const a of alerts) bySeverity[a.severity] = (bySeverity[a.severity] ?? 0) + 1;
    const resolved = alerts.filter((a) => a.resolvedAt !== null);
    const totalResolutionMs = resolved.reduce(
      (sum, a) => sum + (a.resolvedAt!.getTime() - a.triggeredAt.getTime()),
      0,
    );
    const avgResolutionMin =
      resolved.length === 0 ? 0 : Math.round(totalResolutionMs / resolved.length / 60_000);

    /* Top 10 assets with most alerts in the window. */
    const byAsset = new Map<string, { code: string; name: string; count: number }>();
    for (const a of alerts) {
      if (!a.asset) continue;
      const slot = byAsset.get(a.asset.id) ?? { code: a.asset.code, name: a.asset.name, count: 0 };
      slot.count++;
      byAsset.set(a.asset.id, slot);
    }
    const topAssets = Array.from(byAsset.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      company: company ?? { name: '—', taxId: null },
      alerts,
      bySeverity,
      avgResolutionMin,
      topAssets,
      userName,
    };
  }

  async generateExcel(companyId: string, filters: AlertsHistoryFilters): Promise<Buffer> {
    const data = await this.fetchData(companyId, filters);
    const wb = newWorkbook();

    /* ----- Sheet 1 — Histórico de alertas ----- */
    const ws1 = wb.addWorksheet('Histórico de alertas');
    addCompanyHeader(ws1, {
      company: data.company,
      reportTitle: 'Histórico de alertas',
      dateRange: { from: filters.startDate.slice(0, 10), to: filters.endDate.slice(0, 10) },
      columns: 11,
    });
    const headerRow = ws1.addRow([
      'Fecha disparo',
      'Severidad',
      'Tipo',
      'Activo',
      'Documento',
      'Estado',
      'Atendido por',
      'Atendido en',
      'Resuelto por',
      'Resuelto en',
      'Tiempo resolución (min)',
    ]);
    applyHeaderStyle(ws1, headerRow.number);
    freezeHeader(ws1, headerRow.number);
    for (const a of data.alerts) {
      const minutes =
        a.resolvedAt !== null
          ? Math.round((a.resolvedAt.getTime() - a.triggeredAt.getTime()) / 60_000)
          : '';
      ws1.addRow([
        a.triggeredAt,
        a.severity,
        a.triggerType,
        a.asset?.code ?? '—',
        a.documentType?.name ?? '—',
        a.status,
        data.userName(a.acknowledgedBy),
        a.acknowledgedAt ?? '',
        data.userName(a.resolvedBy),
        a.resolvedAt ?? '',
        minutes,
      ]);
    }
    ws1.getColumn('A').numFmt = 'dd-mm-yyyy hh:mm';
    ws1.getColumn('H').numFmt = 'dd-mm-yyyy hh:mm';
    ws1.getColumn('J').numFmt = 'dd-mm-yyyy hh:mm';

    /* ----- Sheet 2 — Estadísticas ----- */
    const ws2 = wb.addWorksheet('Estadísticas');
    addCompanyHeader(ws2, {
      company: data.company,
      reportTitle: 'Estadísticas — alertas',
      dateRange: { from: filters.startDate.slice(0, 10), to: filters.endDate.slice(0, 10) },
      columns: 3,
    });
    const sevHeader = ws2.addRow(['Severidad', 'Cantidad']);
    applyHeaderStyle(ws2, sevHeader.number);
    for (const sev of ['CRITICAL', 'BLOCKING', 'WARNING', 'INFO']) {
      ws2.addRow([sev, data.bySeverity[sev] ?? 0]);
    }
    ws2.addRow([]);
    ws2.addRow(['Tiempo promedio de resolución (min)', data.avgResolutionMin]);
    ws2.addRow([]);
    const topHeader = ws2.addRow(['Top 10 activos con más alertas', '', '']);
    topHeader.font = { bold: true, size: 12 };
    const topRow = ws2.addRow(['Código', 'Nombre', 'Alertas']);
    applyHeaderStyle(ws2, topRow.number);
    for (const t of data.topAssets) ws2.addRow([t.code, t.name, t.count]);
    ws2.getColumn(1).width = 32;
    ws2.getColumn(2).width = 32;
    ws2.getColumn(3).width = 12;
    addCompanyFooter(ws2, { generatedAt: new Date(), columns: 3 });

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async generatePreview(companyId: string, filters: AlertsHistoryFilters) {
    const data = await this.fetchData(companyId, filters);
    return {
      summary: {
        rowCount: data.alerts.length,
        bySeverity: data.bySeverity,
        avgResolutionMin: data.avgResolutionMin,
      },
      columns: ['Fecha', 'Severidad', 'Tipo', 'Activo', 'Estado'],
      rows: data.alerts.slice(0, 10).map((a) => ({
        date: a.triggeredAt.toISOString(),
        severity: a.severity,
        triggerType: a.triggerType,
        asset: a.asset?.code ?? '—',
        status: a.status,
      })),
    };
  }
}
