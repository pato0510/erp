import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  addCompanyFooter,
  addCompanyHeader,
  applyConditionalColor,
  applyHeaderStyle,
  compliancePctTone,
  formatDateColumn,
  freezeHeader,
  newWorkbook,
} from '../excel-helpers';
import type { AcknowledgmentCoverageFilters } from '../dto/report-filter.dto';

@Injectable()
export class AcknowledgmentCoverageReportGenerator {
  constructor(private readonly prisma: PrismaService) {}

  async fetchData(companyId: string, filters: AcknowledgmentCoverageFilters) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, taxId: true },
    });

    const procWhere: Prisma.ProcedureWhereInput = {
      companyId,
      isActive: true,
      requiresAcknowledgment: true,
    };
    if (filters.procedureId) procWhere.id = filters.procedureId;
    if (filters.category)
      procWhere.category = filters.category as Prisma.EnumProcedureCategoryFilter;

    const procedures = await this.prisma.procedure.findMany({
      where: procWhere,
      select: {
        id: true,
        code: true,
        title: true,
        category: true,
        version: true,
        status: true,
      },
      orderBy: [{ code: 'asc' }, { version: 'desc' }],
    });

    const ackWhere: Prisma.ProcedureAcknowledgmentWhereInput = { companyId };
    if (filters.procedureId) ackWhere.procedureId = filters.procedureId;
    if (!filters.includeExempted) {
      ackWhere.status = { not: 'EXEMPTED' };
    }
    const acks = await this.prisma.procedureAcknowledgment.findMany({
      where: ackWhere,
      select: {
        id: true,
        userId: true,
        procedureId: true,
        status: true,
        dueDate: true,
        acknowledgedAt: true,
        acknowledgedFromIp: true,
        signatureHash: true,
        procedure: {
          select: { id: true, code: true, title: true, category: true, version: true },
        },
      },
    });

    /* Per-procedure tally + per-user breakdown. */
    const byProcedure = new Map<
      string,
      {
        proc: (typeof procedures)[number];
        total: number;
        acknowledged: number;
        pending: number;
        expired: number;
        exempted: number;
      }
    >();
    for (const p of procedures) {
      byProcedure.set(p.id, {
        proc: p,
        total: 0,
        acknowledged: 0,
        pending: 0,
        expired: 0,
        exempted: 0,
      });
    }
    for (const a of acks) {
      const slot = byProcedure.get(a.procedureId);
      if (!slot) continue;
      slot.total++;
      if (a.status === 'ACKNOWLEDGED') slot.acknowledged++;
      else if (a.status === 'EXPIRED') slot.expired++;
      else if (a.status === 'EXEMPTED') slot.exempted++;
      else slot.pending++;
    }

    /* Resolve user info for the per-user sheet. */
    const userIds = Array.from(new Set(acks.map((a) => a.userId)));
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const userById = new Map(users.map((u) => [u.id, u]));

    return {
      company: company ?? { name: '—', taxId: null },
      procedures,
      acks,
      byProcedure,
      userById,
    };
  }

  async generateExcel(companyId: string, filters: AcknowledgmentCoverageFilters): Promise<Buffer> {
    const data = await this.fetchData(companyId, filters);
    const wb = newWorkbook();

    /* ----- Sheet 1 — Cobertura por procedimiento ----- */
    const ws1 = wb.addWorksheet('Cobertura por procedimiento');
    addCompanyHeader(ws1, {
      company: data.company,
      reportTitle: 'Cobertura de acuses de procedimientos',
      columns: 10,
    });
    const headerRow = ws1.addRow([
      'Código',
      'Título',
      'Categoría',
      'Versión',
      'Total requerido',
      'Acusados',
      'Pendientes',
      'Vencidos',
      'Eximidos',
      'Cobertura %',
    ]);
    applyHeaderStyle(ws1, headerRow.number);
    for (const slot of data.byProcedure.values()) {
      const denom = slot.total - slot.exempted;
      const pct = denom <= 0 ? 100 : Math.round((slot.acknowledged / denom) * 1000) / 10;
      const row = ws1.addRow([
        slot.proc.code,
        slot.proc.title,
        slot.proc.category,
        slot.proc.version,
        slot.total,
        slot.acknowledged,
        slot.pending,
        slot.expired,
        slot.exempted,
        pct,
      ]);
      row.getCell(10).numFmt = '0.0"%"';
      applyConditionalColor(row.getCell(10), compliancePctTone(pct));
    }
    ws1.getColumn(1).width = 14;
    ws1.getColumn(2).width = 36;
    ws1.getColumn(3).width = 14;
    ws1.getColumn(4).width = 10;
    for (const c of ['E', 'F', 'G', 'H', 'I', 'J']) ws1.getColumn(c).width = 13;
    freezeHeader(ws1, headerRow.number);

    /* ----- Sheet 2 — Detalle por usuario ----- */
    const ws2 = wb.addWorksheet('Detalle por usuario');
    ws2.columns = [
      { header: 'Procedimiento', key: 'code', width: 14 },
      { header: 'Título', key: 'title', width: 36 },
      { header: 'Versión', key: 'version', width: 10 },
      { header: 'Usuario', key: 'user', width: 26 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Estado', key: 'status', width: 14 },
      { header: 'Plazo', key: 'dueDate', width: 12 },
      { header: 'Fecha acuse', key: 'ackAt', width: 18 },
      { header: 'IP', key: 'ip', width: 16 },
      { header: 'Hash firma', key: 'hash', width: 64 },
    ];
    applyHeaderStyle(ws2, 1);
    freezeHeader(ws2, 1);
    formatDateColumn(ws2, 'G');
    for (const a of data.acks) {
      const u = data.userById.get(a.userId);
      ws2.addRow({
        code: a.procedure?.code ?? '—',
        title: a.procedure?.title ?? '—',
        version: a.procedure?.version ?? '—',
        user: u ? `${u.firstName} ${u.lastName}`.trim() || u.email : a.userId,
        email: u?.email ?? '',
        status: this.statusLabel(a.status),
        dueDate: a.dueDate ?? '',
        ackAt: a.acknowledgedAt ?? '',
        ip: a.acknowledgedFromIp ?? '',
        hash: a.signatureHash ?? '',
      });
    }
    ws2.getColumn('H').numFmt = 'dd-mm-yyyy hh:mm';
    addCompanyFooter(ws2, { generatedAt: new Date(), columns: 10 });

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async generatePreview(companyId: string, filters: AcknowledgmentCoverageFilters) {
    const data = await this.fetchData(companyId, filters);
    const procRows = Array.from(data.byProcedure.values())
      .slice(0, 10)
      .map((slot) => {
        const denom = slot.total - slot.exempted;
        const pct = denom <= 0 ? 100 : Math.round((slot.acknowledged / denom) * 1000) / 10;
        return {
          code: slot.proc.code,
          title: slot.proc.title,
          category: slot.proc.category,
          version: slot.proc.version,
          total: slot.total,
          acknowledged: slot.acknowledged,
          pending: slot.pending,
          coveragePct: pct,
        };
      });
    return {
      summary: {
        procedureCount: data.procedures.length,
        ackCount: data.acks.length,
      },
      columns: [
        'Código',
        'Título',
        'Categoría',
        'Versión',
        'Total',
        'Acusados',
        'Pendientes',
        'Cobertura %',
      ],
      rows: procRows,
    };
  }

  private statusLabel(status: string): string {
    switch (status) {
      case 'ACKNOWLEDGED':
        return 'Acusado';
      case 'PENDING':
        return 'Pendiente';
      case 'READ':
        return 'Leído';
      case 'EXPIRED':
        return 'Vencido';
      case 'EXEMPTED':
        return 'Eximido';
      default:
        return status;
    }
  }
}
