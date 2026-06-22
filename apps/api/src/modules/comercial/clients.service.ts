import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

/**
 * CRM "clients" are Finance Counterparties of type CLIENT — READ-ONLY from the
 * Comercial module's perspective (never created or mutated here; they come from
 * Finanzas / the demo seed). The detail view also reads tax_documents (the
 * client's billing history) READ-ONLY, joined by receiverRut = counterparty
 * taxId.
 */
@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  /** List CLIENT counterparties with rolled-up CRM stats. */
  async findAll(companyId: string) {
    const clients = await this.prisma.counterparty.findMany({
      where: { companyId, type: 'CLIENT' },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, taxId: true, email: true },
    });
    if (clients.length === 0) return [];

    const ids = clients.map((c) => c.id);

    // Open opportunities = not in a won/lost stage.
    const [opps, activities] = await Promise.all([
      this.prisma.crmOpportunity.findMany({
        where: { companyId, counterpartyId: { in: ids } },
        select: {
          counterpartyId: true,
          amount: true,
          stage: { select: { isWon: true, isLost: true } },
        },
      }),
      this.prisma.crmActivity.findMany({
        where: { companyId, counterpartyId: { in: ids } },
        select: { counterpartyId: true, date: true },
      }),
    ]);

    const stats = new Map<
      string,
      { oportunidades: number; valorPipeline: number; ultimaActividad: Date | null }
    >();
    for (const id of ids) stats.set(id, { oportunidades: 0, valorPipeline: 0, ultimaActividad: null });

    for (const o of opps) {
      const s = stats.get(o.counterpartyId);
      if (!s) continue;
      s.oportunidades += 1;
      // valorPipeline = sum of OPEN opportunity amounts (exclude won/lost).
      if (!o.stage.isWon && !o.stage.isLost) s.valorPipeline += Number(o.amount);
    }

    for (const a of activities) {
      if (!a.counterpartyId) continue;
      const s = stats.get(a.counterpartyId);
      if (!s) continue;
      if (!s.ultimaActividad || a.date > s.ultimaActividad) s.ultimaActividad = a.date;
    }

    return clients.map((c) => {
      const s = stats.get(c.id) ?? { oportunidades: 0, valorPipeline: 0, ultimaActividad: null };
      return {
        counterpartyId: c.id,
        name: c.name,
        taxId: c.taxId,
        email: c.email,
        oportunidades: s.oportunidades,
        valorPipeline: Math.round(s.valorPipeline),
        ultimaActividad: s.ultimaActividad,
      };
    });
  }

  /** Full client 360: counterparty, READ-ONLY tax history, opportunities,
   * activities and upcoming TAREA tasks. */
  async findOne(id: string, companyId: string) {
    const counterparty = await this.prisma.counterparty.findFirst({
      where: { id, companyId, type: 'CLIENT' },
      select: {
        id: true,
        name: true,
        taxId: true,
        email: true,
        phone: true,
        address: true,
      },
    });
    if (!counterparty) throw new NotFoundException('Cliente no encontrado');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Tax history (READ-ONLY) — only when the client has a RUT to match on.
    const taxDocsPromise = counterparty.taxId
      ? this.prisma.taxDocument.findMany({
          where: { companyId, receiverRut: counterparty.taxId },
          orderBy: { issueDate: 'desc' },
          select: {
            id: true,
            folio: true,
            type: true,
            direction: true,
            issueDate: true,
            netAmount: true,
            taxAmount: true,
            totalAmount: true,
            status: true,
          },
        })
      : Promise.resolve([]);

    const [taxDocs, opportunities, actividades, proximasTareas] = await Promise.all([
      taxDocsPromise,
      this.prisma.crmOpportunity.findMany({
        where: { companyId, counterpartyId: id },
        orderBy: { createdAt: 'desc' },
        include: { stage: { select: { name: true, isWon: true, isLost: true, order: true } } },
      }),
      this.prisma.crmActivity.findMany({
        where: { companyId, counterpartyId: id },
        orderBy: { date: 'desc' },
      }),
      this.prisma.crmActivity.findMany({
        where: { companyId, counterpartyId: id, type: 'TAREA', done: false, dueDate: { gte: today } },
        orderBy: { dueDate: 'asc' },
      }),
    ]);

    return {
      counterparty,
      historialTributario: taxDocs.map((d) => ({
        id: d.id,
        folio: d.folio,
        type: d.type,
        direction: d.direction,
        issueDate: d.issueDate,
        netAmount: Number(d.netAmount),
        taxAmount: Number(d.taxAmount),
        totalAmount: Number(d.totalAmount),
        status: d.status,
      })),
      oportunidades: opportunities.map((o) => ({
        id: o.id,
        title: o.title,
        amount: Number(o.amount),
        probability: o.probability,
        expectedCloseDate: o.expectedCloseDate,
        ownerName: o.ownerName,
        stageId: o.stageId,
        stageName: o.stage.name,
        stageIsWon: o.stage.isWon,
        stageIsLost: o.stage.isLost,
        stageOrder: o.stage.order,
        tags: o.tags,
        generatedCommitmentAmount:
          o.generatedCommitmentAmount === null ? null : Number(o.generatedCommitmentAmount),
        generatedCommitmentDate: o.generatedCommitmentDate,
      })),
      actividades: actividades.map((a) => ({
        id: a.id,
        type: a.type,
        content: a.content,
        date: a.date,
        dueDate: a.dueDate,
        done: a.done,
        opportunityId: a.opportunityId,
      })),
      proximasTareas: proximasTareas.map((a) => ({
        id: a.id,
        content: a.content,
        date: a.date,
        dueDate: a.dueDate,
        opportunityId: a.opportunityId,
      })),
    };
  }
}
