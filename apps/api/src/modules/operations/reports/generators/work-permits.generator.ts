import { Injectable } from '@nestjs/common';
import { Prisma, WorkPermitStatus } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  addCompanyFooter,
  addCompanyHeader,
  applyHeaderStyle,
  freezeHeader,
  newWorkbook,
} from '../excel-helpers';
import type { WorkPermitsFilters } from '../dto/report-filter.dto';

@Injectable()
export class WorkPermitsReportGenerator {
  constructor(private readonly prisma: PrismaService) {}

  async fetchData(companyId: string, filters: WorkPermitsFilters) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, taxId: true },
    });

    const where: Prisma.WorkPermitWhereInput = {
      companyId,
      isActive: true,
      plannedStart: { gte: new Date(filters.startDate), lte: new Date(filters.endDate) },
    };
    if (filters.status) where.status = filters.status as WorkPermitStatus;
    if (filters.supervisorId) where.supervisorId = filters.supervisorId;
    if (filters.permitTypeId) where.permitTypeId = filters.permitTypeId;

    const permits = await this.prisma.workPermit.findMany({
      where,
      select: {
        id: true,
        permitNumber: true,
        title: true,
        status: true,
        plannedStart: true,
        plannedEnd: true,
        actualStart: true,
        actualEnd: true,
        requestedBy: true,
        supervisorId: true,
        workTeam: true,
        gasMeasurements: true,
        incidentsReported: true,
        incidentDescription: true,
        permitType: { select: { name: true, code: true, category: true } },
      },
      orderBy: { plannedStart: 'desc' },
    });

    /* Hydrate supervisor names. */
    const userIds = Array.from(new Set(permits.map((p) => p.supervisorId)));
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const userById = new Map(users.map((u) => [u.id, u]));

    /* Aggregate stats. */
    const totalIssued = permits.length;
    const byStatus = permits.reduce<Record<string, number>>((acc, p) => {
      acc[p.status] = (acc[p.status] ?? 0) + 1;
      return acc;
    }, {});
    const byType = permits.reduce<Record<string, number>>((acc, p) => {
      acc[p.permitType.code] = (acc[p.permitType.code] ?? 0) + 1;
      return acc;
    }, {});

    /* Compute average planned vs actual duration for closed permits. */
    const closedWithActuals = permits.filter(
      (p) => p.status === 'CLOSED' && p.actualStart && p.actualEnd,
    );
    let avgPlannedHrs = 0;
    let avgActualHrs = 0;
    if (closedWithActuals.length > 0) {
      const plannedSum = closedWithActuals.reduce(
        (s, p) => s + (p.plannedEnd.getTime() - p.plannedStart.getTime()),
        0,
      );
      const actualSum = closedWithActuals.reduce(
        (s, p) => s + (p.actualEnd!.getTime() - p.actualStart!.getTime()),
        0,
      );
      avgPlannedHrs = Math.round((plannedSum / closedWithActuals.length / 3_600_000) * 10) / 10;
      avgActualHrs = Math.round((actualSum / closedWithActuals.length / 3_600_000) * 10) / 10;
    }

    return {
      company: company ?? { name: '—', taxId: null },
      permits,
      userById,
      stats: { totalIssued, byStatus, byType, avgPlannedHrs, avgActualHrs },
    };
  }

  async generateExcel(companyId: string, filters: WorkPermitsFilters): Promise<Buffer> {
    const data = await this.fetchData(companyId, filters);
    const wb = newWorkbook();

    /* ----- Sheet 1 — Resumen de PT ----- */
    const ws1 = wb.addWorksheet('Resumen de PT');
    addCompanyHeader(ws1, {
      company: data.company,
      reportTitle: 'Permisos de trabajo',
      dateRange: { from: filters.startDate.slice(0, 10), to: filters.endDate.slice(0, 10) },
      columns: 2,
    });
    const headerRow = ws1.addRow(['Indicador', 'Total']);
    applyHeaderStyle(ws1, headerRow.number);
    ws1.addRow(['Total emitidos', data.stats.totalIssued]);
    for (const [status, count] of Object.entries(data.stats.byStatus)) {
      ws1.addRow([`Estado ${status}`, count]);
    }
    ws1.addRow([]);
    const typeHeader = ws1.addRow(['Por tipo', '']);
    typeHeader.font = { bold: true, size: 12 };
    const typeRow = ws1.addRow(['Código tipo', 'Cantidad']);
    applyHeaderStyle(ws1, typeRow.number);
    for (const [code, count] of Object.entries(data.stats.byType)) ws1.addRow([code, count]);
    ws1.addRow([]);
    ws1.addRow(['Duración promedio planificada (h)', data.stats.avgPlannedHrs]);
    ws1.addRow(['Duración promedio real (h)', data.stats.avgActualHrs]);
    ws1.getColumn(1).width = 36;
    ws1.getColumn(2).width = 14;
    addCompanyFooter(ws1, { generatedAt: new Date(), columns: 2 });

    /* ----- Sheet 2 — Detalle por permiso ----- */
    const ws2 = wb.addWorksheet('Detalle por permiso');
    ws2.columns = [
      { header: 'Número', key: 'number', width: 16 },
      { header: 'Tipo', key: 'type', width: 22 },
      { header: 'Título', key: 'title', width: 32 },
      { header: 'Supervisor', key: 'supervisor', width: 22 },
      { header: 'Equipo', key: 'team', width: 14 },
      { header: 'Inicio plan.', key: 'plannedStart', width: 18 },
      { header: 'Fin plan.', key: 'plannedEnd', width: 18 },
      { header: 'Inicio real', key: 'actualStart', width: 18 },
      { header: 'Fin real', key: 'actualEnd', width: 18 },
      { header: 'Estado', key: 'status', width: 18 },
      { header: 'Mediciones gas', key: 'gas', width: 14 },
      { header: 'Incidentes', key: 'incidents', width: 11 },
      { header: 'Descripción incidente', key: 'incidentDescription', width: 30 },
    ];
    applyHeaderStyle(ws2, 1);
    freezeHeader(ws2, 1);
    for (const p of data.permits) {
      const supervisor = data.userById.get(p.supervisorId);
      const teamCount = Array.isArray(p.workTeam) ? (p.workTeam as Array<unknown>).length : 0;
      const gasCount = Array.isArray(p.gasMeasurements)
        ? (p.gasMeasurements as Array<unknown>).length
        : 0;
      ws2.addRow({
        number: p.permitNumber,
        type: p.permitType.name,
        title: p.title,
        supervisor: supervisor
          ? `${supervisor.firstName} ${supervisor.lastName}`.trim() || supervisor.email
          : '—',
        team: teamCount,
        plannedStart: p.plannedStart,
        plannedEnd: p.plannedEnd,
        actualStart: p.actualStart ?? '',
        actualEnd: p.actualEnd ?? '',
        status: p.status,
        gas: gasCount,
        incidents: p.incidentsReported ? 'Sí' : '',
        incidentDescription: p.incidentDescription ?? '',
      });
    }
    for (const c of ['F', 'G', 'H', 'I']) ws2.getColumn(c).numFmt = 'dd-mm-yyyy hh:mm';

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async generatePreview(companyId: string, filters: WorkPermitsFilters) {
    const data = await this.fetchData(companyId, filters);
    return {
      summary: {
        rowCount: data.permits.length,
        byStatus: data.stats.byStatus,
        avgActualHrs: data.stats.avgActualHrs,
      },
      columns: ['Número', 'Tipo', 'Título', 'Estado', 'Inicio plan.'],
      rows: data.permits.slice(0, 10).map((p) => ({
        number: p.permitNumber,
        type: p.permitType.name,
        title: p.title,
        status: p.status,
        plannedStart: p.plannedStart.toISOString(),
      })),
    };
  }
}
