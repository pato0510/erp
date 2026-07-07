import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OpportunityStage, Prisma, QuoteStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { AddQuoteLineDto } from './dto/add-quote-line.dto';
import { ChangeQuoteStatusDto } from './dto/change-quote-status.dto';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import { UpdateQuoteLineDto } from './dto/update-quote-line.dto';

/* COM-010 — Chilean IVA rate (%). There is NO central Chilean-rate parameterization in
   the codebase today (the only other occurrence is the SII mock, which hardcodes 0.19
   inline). So the rate is a single module-level constant here — NOT hardcoded inside
   the math — and, crucially, it is SNAPSHOTTED onto every quote (`taxRate`) at creation
   so historical documents keep the rate they were computed with even if this changes.
   When a real tax-parameter service lands, read the rate from it here. */
const CHILE_IVA_RATE = 19;

const CLOSED_STAGES: OpportunityStage[] = [OpportunityStage.GANADA, OpportunityStage.PERDIDA];
const TERMINAL_STATUSES: QuoteStatus[] = [
  QuoteStatus.ACEPTADA,
  QuoteStatus.RECHAZADA,
  QuoteStatus.SUPERSEDIDA,
];

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  /** List an opportunity's quotes (newest version first). */
  async findAllByOpportunity(companyId: string, opportunityId: string) {
    await this.assertOpportunityInCompany(opportunityId, companyId);
    return this.prisma.quote.findMany({
      where: { companyId, opportunityId },
      orderBy: [{ version: 'desc' }],
    });
  }

  /** A quote with its (frozen) lines. */
  async findOne(id: string, companyId: string) {
    const quote = await this.prisma.quote.findFirst({
      where: { id, companyId },
      include: { lines: { orderBy: { createdAt: 'asc' } } },
    });
    if (!quote) throw new NotFoundException('Cotización no encontrada');
    return quote;
  }

  /** Rule 1 — CREATE a quote FROM an opportunity: a FROZEN COPY of its service bundle.
   * The opportunity must exist, be in this company and NOT be closed (GANADA/PERDIDA).
   * The bundle must be non-empty. Each bundle line is copied (serviceId, a serviceName
   * SNAPSHOT of the current catalog name, quantity, unitPrice, computed lineTotal); the
   * amounts + the tax rate are persisted. quoteNumber (per company) and version (per
   * opportunity) are assigned inside the transaction. */
  async create(companyId: string, userId: string, opportunityId: string, dto: CreateQuoteDto) {
    const opp = await this.prisma.opportunity.findFirst({
      where: { id: opportunityId, companyId },
      select: { id: true, stage: true },
    });
    if (!opp) throw new NotFoundException('Oportunidad no encontrada');
    if (CLOSED_STAGES.includes(opp.stage)) {
      throw new ConflictException('No se puede cotizar una oportunidad cerrada (GANADA/PERDIDA).');
    }

    const bundle = await this.prisma.opportunityService.findMany({
      where: { companyId, opportunityId },
      orderBy: [{ createdAt: 'asc' }],
    });
    if (bundle.length === 0) {
      throw new BadRequestException(
        'La oportunidad no tiene servicios en su paquete; agrégalos antes de cotizar.',
      );
    }

    // serviceName snapshot — the CURRENT catalog name at copy time.
    const serviceIds = [...new Set(bundle.map((b) => b.serviceId))];
    const services = await this.prisma.serviceCatalog.findMany({
      where: { id: { in: serviceIds }, companyId },
      select: { id: true, name: true },
    });
    const nameById = new Map(services.map((s) => [s.id, s.name]));

    const taxRate = new Prisma.Decimal(CHILE_IVA_RATE);
    const lineData = bundle.map((b) => {
      const quantity = new Prisma.Decimal(b.quantity);
      const unitPrice = new Prisma.Decimal(b.unitPrice);
      return {
        companyId,
        serviceId: b.serviceId,
        serviceName: nameById.get(b.serviceId) ?? 'Servicio',
        quantity,
        unitPrice,
        lineTotal: this.round0(quantity.mul(unitPrice)),
        notes: b.notes ?? null,
      };
    });
    const { net, tax, total } = this.computeAmounts(
      lineData.map((l) => l.lineTotal),
      taxRate,
    );
    const validUntil = dto.validUntil ? this.toDateOnly(dto.validUntil) : null;

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const quoteNumber = await this.nextQuoteNumber(tx, companyId);
      const version = await this.nextVersion(tx, companyId, opportunityId);
      const quote = await tx.quote.create({
        data: {
          companyId,
          createdBy: userId,
          opportunityId,
          quoteNumber,
          version,
          status: QuoteStatus.BORRADOR,
          validUntil,
          netAmount: net,
          taxAmount: tax,
          totalAmount: total,
          taxRate,
          notes: dto.notes ?? null,
        },
      });
      await tx.quoteLine.createMany({
        data: lineData.map((l) => ({ ...l, quoteId: quote.id })),
      });
      const lines = await tx.quoteLine.findMany({
        where: { companyId, quoteId: quote.id },
        orderBy: { createdAt: 'asc' },
      });
      return { ...quote, lines };
    });
  }

  /** Rule 2 — general-field edit (validUntil / notes), BORRADOR only. `status` edits are
   * rejected (they go through changeStatus). From ENVIADA onward the quote is immutable. */
  async update(companyId: string, userId: string, id: string, dto: UpdateQuoteDto) {
    const quote = await this.findQuote(id, companyId);
    if (dto.status !== undefined) {
      throw new BadRequestException(
        'Los cambios de estado se realizan vía PATCH /quotes/:id/status, no en la edición general.',
      );
    }
    this.assertBorrador(quote);

    const data: Prisma.QuoteUncheckedUpdateInput = {};
    if (dto.validUntil !== undefined) {
      data.validUntil = dto.validUntil ? this.toDateOnly(dto.validUntil) : null;
    }
    if (dto.notes !== undefined) data.notes = dto.notes;

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.quote.update({ where: { id }, data });
    });
  }

  /** Rule 3 — the canonical state machine. BORRADOR→ENVIADA (≥1 line + validUntil; sets
   * sentAt); ENVIADA→ACEPTADA (not expired; sets acceptedAt AND auto-supersedes the
   * opportunity's other BORRADOR/ENVIADA quotes; enforces one-accepted); ENVIADA→
   * RECHAZADA (sets rejectedAt). Terminal states admit no transitions. */
  async changeStatus(companyId: string, userId: string, id: string, dto: ChangeQuoteStatusDto) {
    const quote = await this.findQuote(id, companyId);
    const from = quote.status;
    const to = dto.status;

    if (TERMINAL_STATUSES.includes(from)) {
      throw new BadRequestException(
        'La cotización está en un estado terminal (aceptada/rechazada/supersedida); no admite más cambios.',
      );
    }

    if (from === QuoteStatus.BORRADOR && to === QuoteStatus.ENVIADA) {
      const lineCount = await this.prisma.quoteLine.count({ where: { companyId, quoteId: id } });
      if (lineCount === 0) {
        throw new BadRequestException('No puedes enviar una cotización sin líneas.');
      }
      if (!quote.validUntil) {
        throw new BadRequestException('Debes indicar la validez (validUntil) antes de enviar.');
      }
      return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.quote.update({
          where: { id },
          data: { status: QuoteStatus.ENVIADA, sentAt: new Date() },
        });
      });
    }

    if (from === QuoteStatus.ENVIADA && to === QuoteStatus.ACEPTADA) {
      if (quote.validUntil && this.isPast(quote.validUntil)) {
        throw new BadRequestException(
          'La cotización está vencida (validUntil); no puede aceptarse.',
        );
      }
      try {
        return await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
          // One-accepted invariant — pre-check INSIDE the transaction (friendly message
          // for the common case). The partial unique index `quotes_one_accepted_per_
          // opportunity` is the HARD backstop for a concurrent double-accept that slips
          // past this read (see the catch below).
          const otherAccepted = await tx.quote.findFirst({
            where: {
              companyId,
              opportunityId: quote.opportunityId,
              status: QuoteStatus.ACEPTADA,
              id: { not: id },
            },
            select: { id: true },
          });
          if (otherAccepted) {
            throw new ConflictException('La oportunidad ya tiene una cotización aceptada.');
          }
          const updated = await tx.quote.update({
            where: { id },
            data: { status: QuoteStatus.ACEPTADA, acceptedAt: new Date() },
          });
          // Auto-invalidate every OTHER non-terminal quote of the opportunity.
          await tx.quote.updateMany({
            where: {
              companyId,
              opportunityId: quote.opportunityId,
              id: { not: id },
              status: { in: [QuoteStatus.BORRADOR, QuoteStatus.ENVIADA] },
            },
            data: { status: QuoteStatus.SUPERSEDIDA },
          });
          return updated;
        });
      } catch (e) {
        // Concurrent accept: the partial unique index rejected the second ACEPTADA.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new ConflictException('La oportunidad ya tiene una cotización aceptada.');
        }
        throw e;
      }
    }

    if (from === QuoteStatus.ENVIADA && to === QuoteStatus.RECHAZADA) {
      return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.quote.update({
          where: { id },
          data: { status: QuoteStatus.RECHAZADA, rejectedAt: new Date() },
        });
      });
    }

    throw new BadRequestException(`Transición de estado no permitida: ${from} → ${to}.`);
  }

  /** Rule 2 — add a line to a BORRADOR quote (active catalog service; unitPrice snapshot
   * from basePrice when omitted; serviceName snapshot taken now). Recomputes amounts. */
  async addLine(companyId: string, userId: string, quoteId: string, dto: AddQuoteLineDto) {
    const quote = await this.findQuote(quoteId, companyId);
    this.assertBorrador(quote);
    const service = await this.assertActiveServiceInCompany(dto.serviceId, companyId);
    const quantity = new Prisma.Decimal(dto.quantity);
    const unitPrice =
      dto.unitPrice !== undefined
        ? new Prisma.Decimal(dto.unitPrice)
        : new Prisma.Decimal(service.basePrice);
    const lineTotal = this.round0(quantity.mul(unitPrice));

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const line = await tx.quoteLine.create({
        data: {
          companyId,
          quoteId,
          serviceId: dto.serviceId,
          serviceName: service.name,
          quantity,
          unitPrice,
          lineTotal,
          notes: dto.notes ?? null,
        },
      });
      await this.recomputeQuoteAmounts(tx, companyId, quoteId, new Prisma.Decimal(quote.taxRate));
      return line;
    });
  }

  /** Rule 2 — edit a BORRADOR quote line (quantity/unitPrice/notes). serviceId fixed. */
  async updateLine(
    companyId: string,
    userId: string,
    quoteId: string,
    lineId: string,
    dto: UpdateQuoteLineDto,
  ) {
    const quote = await this.findQuote(quoteId, companyId);
    this.assertBorrador(quote);
    const line = await this.findLine(lineId, companyId, quoteId);

    const quantity =
      dto.quantity !== undefined
        ? new Prisma.Decimal(dto.quantity)
        : new Prisma.Decimal(line.quantity);
    const unitPrice =
      dto.unitPrice !== undefined
        ? new Prisma.Decimal(dto.unitPrice)
        : new Prisma.Decimal(line.unitPrice);

    const data: Prisma.QuoteLineUncheckedUpdateInput = {};
    if (dto.quantity !== undefined) data.quantity = quantity;
    if (dto.unitPrice !== undefined) data.unitPrice = unitPrice;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.quantity !== undefined || dto.unitPrice !== undefined) {
      data.lineTotal = this.round0(quantity.mul(unitPrice));
    }

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const updated = await tx.quoteLine.update({ where: { id: lineId }, data });
      await this.recomputeQuoteAmounts(tx, companyId, quoteId, new Prisma.Decimal(quote.taxRate));
      return updated;
    });
  }

  /** Rule 2 — remove a BORRADOR quote line; recompute amounts. */
  async removeLine(companyId: string, userId: string, quoteId: string, lineId: string) {
    const quote = await this.findQuote(quoteId, companyId);
    this.assertBorrador(quote);
    await this.findLine(lineId, companyId, quoteId);
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      await tx.quoteLine.delete({ where: { id: lineId } });
      await this.recomputeQuoteAmounts(tx, companyId, quoteId, new Prisma.Decimal(quote.taxRate));
      return { id: lineId, deleted: true };
    });
  }

  /** Rule 4 — delete a BORRADOR quote (scrap paper). Any other status is a commercial
   * record and cannot be deleted (409). */
  async remove(companyId: string, userId: string, id: string) {
    const quote = await this.findQuote(id, companyId);
    if (quote.status !== QuoteStatus.BORRADOR) {
      throw new ConflictException(
        'Solo se pueden eliminar cotizaciones en borrador; las enviadas son un registro comercial.',
      );
    }
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.quote.delete({ where: { id } });
    });
  }

  /* ── helpers ── */

  /** Chilean invoices/quotes are whole pesos — round to 0 decimals, HALF-UP. The
   * rounding mode is passed explicitly (not left to the decimal.js global default) so
   * the behavior can't drift if that default is ever reconfigured elsewhere. */
  private round0(d: Prisma.Decimal): Prisma.Decimal {
    return d.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
  }

  private computeAmounts(lineTotals: Prisma.Decimal[], taxRate: Prisma.Decimal) {
    const net = lineTotals.reduce((acc, lt) => acc.add(lt), new Prisma.Decimal(0));
    const tax = this.round0(net.mul(taxRate).div(100));
    const total = net.add(tax);
    return { net, tax, total };
  }

  private async recomputeQuoteAmounts(
    tx: Prisma.TransactionClient,
    companyId: string,
    quoteId: string,
    taxRate: Prisma.Decimal,
  ) {
    const lines = await tx.quoteLine.findMany({
      where: { companyId, quoteId },
      select: { lineTotal: true },
    });
    const { net, tax, total } = this.computeAmounts(
      lines.map((l) => new Prisma.Decimal(l.lineTotal)),
      taxRate,
    );
    await tx.quote.update({
      where: { id: quoteId },
      data: { netAmount: net, taxAmount: tax, totalAmount: total },
    });
  }

  /** Per-company sequential number COT-0001…. Derived from the current max inside the
   * creation transaction. Single-tenant reality (one active company) means real
   * contention is nil; the @@unique([companyId, quoteNumber]) is the hard backstop.
   * Zero-padded to 4 digits — ordering holds through COT-9999 (ample for one tenant). */
  private async nextQuoteNumber(tx: Prisma.TransactionClient, companyId: string) {
    const last = await tx.quote.findFirst({
      where: { companyId },
      orderBy: { quoteNumber: 'desc' },
      select: { quoteNumber: true },
    });
    const n = last ? (parseInt(last.quoteNumber.replace(/\D/g, ''), 10) || 0) + 1 : 1;
    return `COT-${String(n).padStart(4, '0')}`;
  }

  /** Per-opportunity sequential version 1,2,3…. */
  private async nextVersion(
    tx: Prisma.TransactionClient,
    companyId: string,
    opportunityId: string,
  ) {
    const last = await tx.quote.findFirst({
      where: { companyId, opportunityId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return (last?.version ?? 0) + 1;
  }

  private assertBorrador(quote: { status: QuoteStatus }) {
    if (quote.status !== QuoteStatus.BORRADOR) {
      throw new ConflictException(
        'La cotización ya no es un borrador; es un documento inmutable. Solo aplican cambios de estado.',
      );
    }
  }

  private async findQuote(id: string, companyId: string) {
    const quote = await this.prisma.quote.findFirst({ where: { id, companyId } });
    if (!quote) throw new NotFoundException('Cotización no encontrada');
    return quote;
  }

  private async findLine(lineId: string, companyId: string, quoteId: string) {
    const line = await this.prisma.quoteLine.findFirst({
      where: { id: lineId, companyId, quoteId },
    });
    if (!line) throw new NotFoundException('Línea de cotización no encontrada');
    return line;
  }

  private async assertOpportunityInCompany(opportunityId: string, companyId: string) {
    const opp = await this.prisma.opportunity.findFirst({
      where: { id: opportunityId, companyId },
      select: { id: true },
    });
    if (!opp) throw new NotFoundException('Oportunidad no encontrada');
  }

  private async assertActiveServiceInCompany(serviceId: string, companyId: string) {
    const service = await this.prisma.serviceCatalog.findFirst({
      where: { id: serviceId, companyId },
      select: { id: true, name: true, basePrice: true, isActive: true },
    });
    if (!service) throw new BadRequestException('Servicio no encontrado en esta empresa.');
    if (!service.isActive) {
      throw new BadRequestException('El servicio está inactivo y no puede agregarse.');
    }
    return service;
  }

  /** Anchor a YYYY-MM-DD to UTC midnight (HR-004b — avoids the @db.Date off-by-one). */
  private toDateOnly(dateStr: string): Date {
    const d = new Date(dateStr);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  /** True if a @db.Date value is strictly before today (UTC). */
  private isPast(date: Date): boolean {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return date.getTime() < today.getTime();
  }
}
