import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  addCompanyFooter,
  addCompanyHeader,
  applyHeaderStyle,
  freezeHeader,
  newWorkbook,
} from '../excel-helpers';
import type { ActivityFilters } from '../dto/report-filter.dto';

interface ActivityEvent {
  timestamp: Date;
  type: string;
  userId: string | null;
  description: string;
  asset: string;
  detail: string;
}

@Injectable()
export class ActivityReportGenerator {
  constructor(private readonly prisma: PrismaService) {}

  async fetchData(companyId: string, filters: ActivityFilters) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, taxId: true },
    });
    const start = new Date(filters.startDate);
    const end = new Date(filters.endDate);
    const types = new Set(
      filters.activityTypes && filters.activityTypes.length > 0
        ? filters.activityTypes
        : ['document', 'alert', 'asset-status', 'work-permit', 'procedure', 'exception'],
    );

    const documents = types.has('document')
      ? await this.prisma.documentRecord.findMany({
          where: {
            companyId,
            isActive: true,
            statusChangedAt: { gte: start, lte: end },
          },
          select: {
            id: true,
            status: true,
            fileName: true,
            statusChangedAt: true,
            statusChangedBy: true,
            asset: { select: { id: true, code: true, name: true } },
            documentType: { select: { name: true } },
          },
          orderBy: { statusChangedAt: 'desc' },
        })
      : [];

    const alerts = types.has('alert')
      ? await this.prisma.alertInstance.findMany({
          where: { companyId, triggeredAt: { gte: start, lte: end } },
          select: {
            id: true,
            title: true,
            severity: true,
            status: true,
            triggeredAt: true,
            asset: { select: { code: true, name: true } },
          },
          orderBy: { triggeredAt: 'desc' },
        })
      : [];

    const statusChanges = types.has('asset-status')
      ? await this.prisma.assetStatusChange.findMany({
          where: { companyId, createdAt: { gte: start, lte: end } },
          select: {
            id: true,
            previousStatus: true,
            newStatus: true,
            changeType: true,
            reason: true,
            createdAt: true,
            changedBy: true,
            asset: { select: { code: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
        })
      : [];

    const workPermits = types.has('work-permit')
      ? await this.prisma.workPermit.findMany({
          where: { companyId, statusChangedAt: { gte: start, lte: end } },
          select: {
            id: true,
            permitNumber: true,
            title: true,
            status: true,
            statusChangedAt: true,
            statusChangedBy: true,
          },
          orderBy: { statusChangedAt: 'desc' },
        })
      : [];

    const procedures = types.has('procedure')
      ? await this.prisma.procedureRevision.findMany({
          where: { companyId, createdAt: { gte: start, lte: end } },
          select: {
            id: true,
            procedureId: true,
            revisionType: true,
            changedBy: true,
            createdAt: true,
            procedure: { select: { code: true, title: true } },
          },
          orderBy: { createdAt: 'desc' },
        })
      : [];

    const exceptions = types.has('exception')
      ? await this.prisma.assetException.findMany({
          where: {
            companyId,
            OR: [
              { approvedAt: { gte: start, lte: end } },
              { rejectedAt: { gte: start, lte: end } },
              { revokedAt: { gte: start, lte: end } },
              { requestedAt: { gte: start, lte: end } },
            ],
          },
          select: {
            id: true,
            status: true,
            requestedAt: true,
            approvedAt: true,
            rejectedAt: true,
            revokedAt: true,
            requestedBy: true,
            approvedBy: true,
            rejectedBy: true,
            revokedBy: true,
            asset: { select: { code: true, name: true } },
          },
          orderBy: { requestedAt: 'desc' },
        })
      : [];

    /* Resolve user names in a single pass — the activity stream is
       basically useless without them. */
    const userIds = new Set<string>();
    for (const d of documents) if (d.statusChangedBy) userIds.add(d.statusChangedBy);
    for (const s of statusChanges) if (s.changedBy) userIds.add(s.changedBy);
    for (const w of workPermits) if (w.statusChangedBy) userIds.add(w.statusChangedBy);
    for (const p of procedures) if (p.changedBy) userIds.add(p.changedBy);
    for (const e of exceptions) {
      for (const id of [e.requestedBy, e.approvedBy, e.rejectedBy, e.revokedBy]) {
        if (id) userIds.add(id);
      }
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

    /* Build the unified stream. */
    const events: ActivityEvent[] = [];
    for (const d of documents) {
      events.push({
        timestamp: d.statusChangedAt!,
        type: 'Documento',
        userId: d.statusChangedBy,
        description: `${d.status} — ${d.documentType.name}`,
        asset: d.asset?.code ?? '—',
        detail: d.fileName,
      });
    }
    for (const a of alerts) {
      events.push({
        timestamp: a.triggeredAt,
        type: 'Alerta',
        userId: null,
        description: `${a.severity} — ${a.title}`,
        asset: a.asset?.code ?? '—',
        detail: a.status,
      });
    }
    for (const s of statusChanges) {
      events.push({
        timestamp: s.createdAt,
        type: 'Estado activo',
        userId: s.changedBy,
        description: `${s.previousStatus} → ${s.newStatus}`,
        asset: s.asset?.code ?? '—',
        detail: `${s.changeType}${s.reason ? ` — ${s.reason}` : ''}`,
      });
    }
    for (const w of workPermits) {
      events.push({
        timestamp: w.statusChangedAt!,
        type: 'Permiso trabajo',
        userId: w.statusChangedBy,
        description: `${w.permitNumber} → ${w.status}`,
        asset: '—',
        detail: w.title,
      });
    }
    for (const p of procedures) {
      events.push({
        timestamp: p.createdAt,
        type: 'Procedimiento',
        userId: p.changedBy,
        description: `${p.revisionType}${p.procedure ? ` — ${p.procedure.code}` : ''}`,
        asset: '—',
        detail: p.procedure?.title ?? '',
      });
    }
    for (const e of exceptions) {
      const ts = e.revokedAt ?? e.rejectedAt ?? e.approvedAt ?? e.requestedAt ?? null;
      const actor = e.revokedBy ?? e.rejectedBy ?? e.approvedBy ?? e.requestedBy ?? null;
      if (!ts) continue;
      events.push({
        timestamp: ts,
        type: 'Excepción',
        userId: actor,
        description: `${e.status}`,
        asset: e.asset?.code ?? '—',
        detail: '',
      });
    }
    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    /* Period summary counts. */
    const summary = {
      documentsApproved: documents.filter((d) => d.status === 'APPROVED').length,
      documentsRejected: documents.filter((d) => d.status === 'REJECTED').length,
      documentsUploaded: documents.length,
      workPermitsIssued: workPermits.length,
      workPermitsClosed: workPermits.filter((w) => w.status === 'CLOSED').length,
      proceduresPublished: procedures.filter((p) => p.revisionType === 'PUBLISHED').length,
      alertsGenerated: alerts.length,
      alertsResolved: alerts.filter((a) => a.status === 'RESOLVED').length,
      exceptionsApproved: exceptions.filter((e) => !!e.approvedAt).length,
    };

    return { company: company ?? { name: '—', taxId: null }, events, summary, userName };
  }

  async generateExcel(companyId: string, filters: ActivityFilters): Promise<Buffer> {
    const data = await this.fetchData(companyId, filters);
    const wb = newWorkbook();

    /* ----- Sheet 1 — Resumen del período ----- */
    const ws1 = wb.addWorksheet('Resumen del período');
    addCompanyHeader(ws1, {
      company: data.company,
      reportTitle: 'Actividad operacional',
      dateRange: { from: filters.startDate.slice(0, 10), to: filters.endDate.slice(0, 10) },
      columns: 2,
    });
    const summaryRows: Array<[string, number]> = [
      ['Documentos cargados', data.summary.documentsUploaded],
      ['Documentos aprobados', data.summary.documentsApproved],
      ['Documentos rechazados', data.summary.documentsRejected],
      ['Permisos de trabajo emitidos', data.summary.workPermitsIssued],
      ['Permisos de trabajo cerrados', data.summary.workPermitsClosed],
      ['Procedimientos publicados', data.summary.proceduresPublished],
      ['Alertas generadas', data.summary.alertsGenerated],
      ['Alertas resueltas', data.summary.alertsResolved],
      ['Excepciones aprobadas', data.summary.exceptionsApproved],
    ];
    const headerRow = ws1.addRow(['Indicador', 'Total']);
    applyHeaderStyle(ws1, headerRow.number);
    for (const [label, value] of summaryRows) ws1.addRow([label, value]);
    ws1.getColumn(1).width = 36;
    ws1.getColumn(2).width = 14;
    addCompanyFooter(ws1, { generatedAt: new Date(), columns: 2 });

    /* ----- Sheet 2 — Stream de actividad ----- */
    const ws2 = wb.addWorksheet('Stream de actividad');
    ws2.columns = [
      { header: 'Fecha', key: 'date', width: 18 },
      { header: 'Tipo', key: 'type', width: 16 },
      { header: 'Usuario', key: 'user', width: 22 },
      { header: 'Descripción', key: 'description', width: 36 },
      { header: 'Activo', key: 'asset', width: 14 },
      { header: 'Detalle', key: 'detail', width: 30 },
    ];
    applyHeaderStyle(ws2, 1);
    freezeHeader(ws2, 1);
    for (const e of data.events) {
      ws2.addRow({
        date: e.timestamp,
        type: e.type,
        user: data.userName(e.userId),
        description: e.description,
        asset: e.asset,
        detail: e.detail,
      });
    }
    ws2.getColumn('A').numFmt = 'dd-mm-yyyy hh:mm';

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async generatePreview(companyId: string, filters: ActivityFilters) {
    const data = await this.fetchData(companyId, filters);
    return {
      summary: {
        rowCount: data.events.length,
        ...data.summary,
      },
      columns: ['Fecha', 'Tipo', 'Usuario', 'Descripción', 'Activo'],
      rows: data.events.slice(0, 10).map((e) => ({
        date: e.timestamp.toISOString(),
        type: e.type,
        user: data.userName(e.userId),
        description: e.description,
        asset: e.asset,
      })),
    };
  }
}
