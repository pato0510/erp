import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CrmQuoteStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { CreateQuoteItemDto } from './dto/create-quote-item.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';

/**
 * CRM Quotes (builder data + on-screen preview only — NO PDF / email). Totals
 * are ALWAYS recomputed server-side from the line items:
 *   lineTotal = quantity * unitPrice * (1 - discountPct/100)
 *   subtotal  = Σ lineTotal
 *   ivaAmount = round(subtotal * 0.19)
 *   total     = subtotal + ivaAmount
 * counterpartyId → Finance Counterparty (plain column); opportunityId → optional
 * CrmOpportunity (plain column). Names are resolved by manual lookups.
 */
@Injectable()
export class QuotesService {
  constructor(private readonly prisma: PrismaService) {}

  private round(n: number): number {
    return Math.round(n);
  }

  private lineTotal(quantity: number, unitPrice: number, discountPct: number): number {
    return this.round(quantity * unitPrice * (1 - discountPct / 100));
  }

  /** Recomputes subtotal / ivaAmount / total from the quote's current items. */
  private async recalc(quoteId: string) {
    const items = await this.prisma.crmQuoteItem.findMany({
      where: { quoteId },
      select: { lineTotal: true },
    });
    const subtotal = items.reduce((sum, it) => sum + Number(it.lineTotal), 0);
    const ivaAmount = this.round(subtotal * 0.19);
    const total = subtotal + ivaAmount;
    await this.prisma.crmQuote.update({
      where: { id: quoteId },
      data: {
        subtotal: new Prisma.Decimal(this.round(subtotal)),
        ivaAmount: new Prisma.Decimal(ivaAmount),
        total: new Prisma.Decimal(total),
      },
    });
  }

  private async assertCounterparty(companyId: string, counterpartyId: string) {
    const cp = await this.prisma.counterparty.findFirst({
      where: { id: counterpartyId, companyId },
      select: { id: true },
    });
    if (!cp) throw new BadRequestException('Cliente (counterparty) no encontrado');
  }

  private async assertOpportunity(companyId: string, opportunityId: string) {
    const o = await this.prisma.crmOpportunity.findFirst({
      where: { id: opportunityId, companyId },
      select: { id: true },
    });
    if (!o) throw new BadRequestException('Oportunidad no encontrada');
  }

  /** List quotes with counterpartyName + opportunityTitle + itemCount. */
  async findAll(companyId: string) {
    const quotes = await this.prisma.crmQuote.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { items: true } } },
    });

    const counterpartyIds = [...new Set(quotes.map((q) => q.counterpartyId))];
    const opportunityIds = [
      ...new Set(quotes.map((q) => q.opportunityId).filter((v): v is string => !!v)),
    ];

    const [counterparties, opportunities] = await Promise.all([
      counterpartyIds.length
        ? this.prisma.counterparty.findMany({
            where: { companyId, id: { in: counterpartyIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      opportunityIds.length
        ? this.prisma.crmOpportunity.findMany({
            where: { companyId, id: { in: opportunityIds } },
            select: { id: true, title: true },
          })
        : Promise.resolve([]),
    ]);

    const cpName = new Map(counterparties.map((c) => [c.id, c.name]));
    const oppTitle = new Map(opportunities.map((o) => [o.id, o.title]));

    return quotes.map((q) => ({
      id: q.id,
      opportunityId: q.opportunityId,
      opportunityTitle: q.opportunityId ? oppTitle.get(q.opportunityId) ?? null : null,
      counterpartyId: q.counterpartyId,
      counterpartyName: cpName.get(q.counterpartyId) ?? null,
      status: q.status,
      validUntil: q.validUntil,
      executionTerm: q.executionTerm,
      version: q.version,
      subtotal: Number(q.subtotal),
      ivaAmount: Number(q.ivaAmount),
      total: Number(q.total),
      itemCount: q._count.items,
      createdAt: q.createdAt,
    }));
  }

  /** Full quote: meta + items + counterparty + opportunity. */
  async findOne(id: string, companyId: string) {
    const q = await this.prisma.crmQuote.findFirst({
      where: { id, companyId },
      include: { items: { orderBy: { id: 'asc' } } },
    });
    if (!q) throw new NotFoundException('Cotización no encontrada');

    const [counterparty, opportunity, services] = await Promise.all([
      this.prisma.counterparty.findFirst({
        where: { id: q.counterpartyId, companyId },
        select: { id: true, name: true, taxId: true, email: true, phone: true, address: true },
      }),
      q.opportunityId
        ? this.prisma.crmOpportunity.findFirst({
            where: { id: q.opportunityId, companyId },
            select: { id: true, title: true, amount: true },
          })
        : Promise.resolve(null),
      (async () => {
        const ids = [...new Set(q.items.map((it) => it.serviceId).filter((v): v is string => !!v))];
        if (!ids.length) return [] as { id: string; name: string }[];
        return this.prisma.serviceCatalog.findMany({
          where: { companyId, id: { in: ids } },
          select: { id: true, name: true },
        });
      })(),
    ]);

    const serviceName = new Map(services.map((s) => [s.id, s.name]));

    return {
      id: q.id,
      opportunityId: q.opportunityId,
      counterpartyId: q.counterpartyId,
      status: q.status,
      validUntil: q.validUntil,
      executionTerm: q.executionTerm,
      commercialConditions: q.commercialConditions,
      technicalNotes: q.technicalNotes,
      version: q.version,
      subtotal: Number(q.subtotal),
      ivaAmount: Number(q.ivaAmount),
      total: Number(q.total),
      createdAt: q.createdAt,
      updatedAt: q.updatedAt,
      counterparty,
      counterpartyName: counterparty?.name ?? null,
      opportunity,
      opportunityTitle: opportunity?.title ?? null,
      items: q.items.map((it) => ({
        id: it.id,
        serviceId: it.serviceId,
        serviceName: it.serviceId ? serviceName.get(it.serviceId) ?? null : null,
        description: it.description,
        quantity: Number(it.quantity),
        unit: it.unit,
        unitPrice: Number(it.unitPrice),
        discountPct: Number(it.discountPct),
        lineTotal: Number(it.lineTotal),
      })),
    };
  }

  async create(companyId: string, dto: CreateQuoteDto) {
    await this.assertCounterparty(companyId, dto.counterpartyId);
    if (dto.opportunityId) await this.assertOpportunity(companyId, dto.opportunityId);

    const created = await this.prisma.crmQuote.create({
      data: {
        companyId,
        opportunityId: dto.opportunityId ?? null,
        counterpartyId: dto.counterpartyId,
        status: 'BORRADOR',
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        executionTerm: dto.executionTerm ?? null,
        commercialConditions: dto.commercialConditions ?? null,
        technicalNotes: dto.technicalNotes ?? null,
      },
    });
    return this.findOne(created.id, companyId);
  }

  /** Updates META fields only (status flows through changeStatus). */
  async update(id: string, companyId: string, dto: UpdateQuoteDto) {
    const existing = await this.prisma.crmQuote.findFirst({ where: { id, companyId } });
    if (!existing) throw new NotFoundException('Cotización no encontrada');
    if (dto.counterpartyId) await this.assertCounterparty(companyId, dto.counterpartyId);
    if (dto.opportunityId) await this.assertOpportunity(companyId, dto.opportunityId);

    await this.prisma.crmQuote.update({
      where: { id },
      data: {
        opportunityId: dto.opportunityId ?? undefined,
        counterpartyId: dto.counterpartyId ?? undefined,
        validUntil: dto.validUntil !== undefined ? new Date(dto.validUntil) : undefined,
        executionTerm: dto.executionTerm ?? undefined,
        commercialConditions: dto.commercialConditions ?? undefined,
        technicalNotes: dto.technicalNotes ?? undefined,
      },
    });
    return this.findOne(id, companyId);
  }

  async changeStatus(id: string, companyId: string, status: CrmQuoteStatus) {
    const existing = await this.prisma.crmQuote.findFirst({ where: { id, companyId } });
    if (!existing) throw new NotFoundException('Cotización no encontrada');
    await this.prisma.crmQuote.update({ where: { id }, data: { status } });
    return this.findOne(id, companyId);
  }

  async remove(id: string, companyId: string) {
    const existing = await this.prisma.crmQuote.findFirst({ where: { id, companyId } });
    if (!existing) throw new NotFoundException('Cotización no encontrada');
    // Items cascade-delete via the FK (onDelete: Cascade).
    await this.prisma.crmQuote.delete({ where: { id } });
    return { id, deleted: true };
  }

  /** Adds a line item, computes its lineTotal, then recalcs the quote totals. */
  async addItem(quoteId: string, companyId: string, dto: CreateQuoteItemDto) {
    const quote = await this.prisma.crmQuote.findFirst({ where: { id: quoteId, companyId } });
    if (!quote) throw new NotFoundException('Cotización no encontrada');

    if (dto.serviceId) {
      const service = await this.prisma.serviceCatalog.findFirst({
        where: { id: dto.serviceId, companyId },
        select: { id: true },
      });
      if (!service) throw new BadRequestException('Servicio no encontrado');
    }

    const discountPct = dto.discountPct ?? 0;
    const lineTotal = this.lineTotal(dto.quantity, dto.unitPrice, discountPct);

    await this.prisma.crmQuoteItem.create({
      data: {
        companyId,
        quoteId,
        serviceId: dto.serviceId ?? null,
        description: dto.description,
        quantity: new Prisma.Decimal(dto.quantity),
        unit: dto.unit,
        unitPrice: new Prisma.Decimal(dto.unitPrice),
        discountPct: new Prisma.Decimal(discountPct),
        lineTotal: new Prisma.Decimal(lineTotal),
      },
    });

    await this.recalc(quoteId);
    return this.findOne(quoteId, companyId);
  }

  /** Removes a line item, then recalcs the quote totals. */
  async removeItem(quoteId: string, itemId: string, companyId: string) {
    const quote = await this.prisma.crmQuote.findFirst({ where: { id: quoteId, companyId } });
    if (!quote) throw new NotFoundException('Cotización no encontrada');

    const item = await this.prisma.crmQuoteItem.findFirst({
      where: { id: itemId, quoteId, companyId },
      select: { id: true },
    });
    if (!item) throw new NotFoundException('Ítem no encontrado');

    await this.prisma.crmQuoteItem.delete({ where: { id: itemId } });
    await this.recalc(quoteId);
    return this.findOne(quoteId, companyId);
  }
}
