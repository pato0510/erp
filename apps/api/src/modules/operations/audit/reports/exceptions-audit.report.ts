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

/* OPS-036 (report 05) — temporary exceptions issued during the
   audit period. Auditors care that every exception has a) a
   written justification, b) a finite vigencia, and c) a clear
   approver. The detail sheet exposes all four lifecycle states
   (PENDING, APPROVED, REJECTED, REVOKED, EXPIRED). */

export interface ExceptionsAuditFilters {
  startDate: string;
  endDate: string;
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'REVOKED';
}

@Injectable()
export class ExceptionsAuditReportGenerator {
  constructor(private readonly prisma: PrismaService) {}

  async fetchData(companyId: string, filters: ExceptionsAuditFilters) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, taxId: true },
    });

    /* The window applies to *requestedAt* — that's the auditor-
       relevant timeline (when did the company need to grant a
       break?). validUntil-based windows would miss exceptions
       requested in the period that auditors care about. */
    const where: Prisma.AssetExceptionWhereInput = {
      companyId,
      requestedAt: {
        gte: new Date(filters.startDate),
        lte: new Date(filters.endDate),
      },
    };
    if (filters.status) where.status = filters.status;

    const exceptions = await this.prisma.assetException.findMany({
      where,
      select: {
        id: true,
        status: true,
        requestedReason: true,
        requestedAt: true,
        requestedBy: true,
        requestedDocumentTypeIds: true,
        approvedBy: true,
        approvedReason: true,
        approvedAt: true,
        rejectedBy: true,
        rejectedReason: true,
        rejectedAt: true,
        revokedBy: true,
        revokedReason: true,
        revokedAt: true,
        validFrom: true,
        validUntil: true,
        asset: { select: { id: true, code: true, name: true } },
      },
      orderBy: { requestedAt: 'desc' },
    });

    /* Resolve every actor name in one batched query. */
    const userIds = new Set<string>();
    for (const e of exceptions) {
      if (e.requestedBy) userIds.add(e.requestedBy);
      if (e.approvedBy) userIds.add(e.approvedBy);
      if (e.rejectedBy) userIds.add(e.rejectedBy);
      if (e.revokedBy) userIds.add(e.revokedBy);
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

    /* Resolve doc-type names so the "blockingDocumentTypes"
       column is human-readable. The triggering ids are stored
       on the exception row at request time so this remains a
       point-in-time snapshot even if the catalog changes. */
    const docTypeIds = new Set<string>();
    for (const e of exceptions) {
      for (const id of e.requestedDocumentTypeIds) docTypeIds.add(id);
    }
    const docTypes = docTypeIds.size
      ? await this.prisma.operationalDocumentType.findMany({
          where: { id: { in: Array.from(docTypeIds) } },
          select: { id: true, code: true, name: true },
        })
      : [];
    const docTypeById = new Map(docTypes.map((d) => [d.id, d]));

    /* Aggregates */
    const byStatus: Record<string, number> = {};
    for (const e of exceptions) byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;

    /* Average duration of APPROVED exceptions (validUntil − validFrom). */
    const durations: number[] = [];
    for (const e of exceptions) {
      if (e.status === 'APPROVED' && e.validFrom && e.validUntil) {
        durations.push(Math.max(0, (e.validUntil.getTime() - e.validFrom.getTime()) / 86_400_000));
      }
    }
    const avgDurationDays =
      durations.length === 0
        ? 0
        : Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10;

    /* Average days from request to approval — measures responsiveness
       of the approval workflow. */
    const requestToApproval: number[] = [];
    for (const e of exceptions) {
      if (e.approvedAt && e.requestedAt) {
        requestToApproval.push((e.approvedAt.getTime() - e.requestedAt.getTime()) / 86_400_000);
      }
    }
    const avgDaysToApproval =
      requestToApproval.length === 0
        ? 0
        : Math.round(
            (requestToApproval.reduce((a, b) => a + b, 0) / requestToApproval.length) * 10,
          ) / 10;

    return {
      company: company ?? { name: '—', taxId: null },
      exceptions,
      byStatus,
      avgDurationDays,
      avgDaysToApproval,
      userName,
      docTypeById,
    };
  }

  async generateExcel(companyId: string, filters: ExceptionsAuditFilters): Promise<Buffer> {
    const data = await this.fetchData(companyId, filters);
    const wb = newWorkbook();

    /* ----- Sheet 1 — Resumen ----- */
    const ws1 = wb.addWorksheet('Resumen');
    addCompanyHeader(ws1, {
      company: data.company,
      reportTitle: 'Excepciones temporales aprobadas',
      dateRange: { from: filters.startDate.slice(0, 10), to: filters.endDate.slice(0, 10) },
      columns: 2,
    });
    ws1.addRow(['Total de excepciones en el período', data.exceptions.length]);
    ws1.addRow(['Duración promedio (días)', data.avgDurationDays]);
    ws1.addRow(['Días promedio de solicitud a aprobación', data.avgDaysToApproval]);
    ws1.addRow([]);
    const sevHeader = ws1.addRow(['Estado', 'Cantidad']);
    applyHeaderStyle(ws1, sevHeader.number);
    for (const status of ['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'REVOKED']) {
      ws1.addRow([status, data.byStatus[status] ?? 0]);
    }
    ws1.getColumn(1).width = 42;
    ws1.getColumn(2).width = 18;
    addCompanyFooter(ws1, { generatedAt: new Date(), columns: 2 });

    /* ----- Sheet 2 — Detalle por excepción ----- */
    const ws2 = wb.addWorksheet('Detalle');
    addCompanyHeader(ws2, {
      company: data.company,
      reportTitle: 'Detalle de excepciones',
      dateRange: { from: filters.startDate.slice(0, 10), to: filters.endDate.slice(0, 10) },
      columns: 14,
    });
    const headerRow = ws2.addRow([
      'ID',
      'Activo (código)',
      'Activo (nombre)',
      'Estado',
      'Solicitado por',
      'Solicitado el',
      'Razón solicitada',
      'Aprobado por',
      'Aprobado el',
      'Razón de aprobación',
      'Vigencia desde',
      'Vigencia hasta',
      'Revocado / Rechazado por',
      'Documentos / razón final',
    ]);
    applyHeaderStyle(ws2, headerRow.number);
    freezeHeader(ws2, headerRow.number);
    for (const e of data.exceptions) {
      const docNames = e.requestedDocumentTypeIds
        .map((id) => {
          const dt = data.docTypeById.get(id);
          return dt ? `${dt.code} (${dt.name})` : id;
        })
        .join('; ');
      const lastActor = e.revokedBy
        ? `${data.userName(e.revokedBy)} (revocó)`
        : e.rejectedBy
          ? `${data.userName(e.rejectedBy)} (rechazó)`
          : '—';
      const lastReason = e.revokedReason ?? e.rejectedReason ?? docNames ?? '';
      ws2.addRow([
        e.id,
        e.asset?.code ?? '—',
        e.asset?.name ?? '—',
        e.status,
        data.userName(e.requestedBy),
        e.requestedAt,
        e.requestedReason,
        data.userName(e.approvedBy),
        e.approvedAt ?? '',
        e.approvedReason ?? '',
        e.validFrom ?? '',
        e.validUntil ?? '',
        lastActor,
        lastReason,
      ]);
    }
    ws2.getColumn('F').numFmt = 'dd-mm-yyyy hh:mm';
    ws2.getColumn('I').numFmt = 'dd-mm-yyyy hh:mm';
    ws2.getColumn('K').numFmt = 'dd-mm-yyyy';
    ws2.getColumn('L').numFmt = 'dd-mm-yyyy';
    addCompanyFooter(ws2, { generatedAt: new Date(), columns: 14 });

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }
}
