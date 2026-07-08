import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { RlsService } from '../common/rls/rls.service';
import { CompanyAlertSettingsService } from '../operations/alerts/company-alert-settings.service';
import type { ComercialOpportunityWonEvent } from '../operations/events/domain-event-types';

/* COM-014 — Finance side of the Comercial→Operaciones handoff. This is the SECOND listener
   on comercial.opportunity-won: Operaciones already has one (ServiceOrderHandoffListener)
   creating the ServiceOrder; Finance gets this one, creating the projected INCOME Commitment
   in the cashflow. The two fire independently (EventEmitter2 fan-out) and each dedupes on
   its own side — neither knows about the other.

   It MIRRORS the reference renewal handler (finance/operations-listeners.service.ts):
   enable-toggle → dedupe → fiscal-period-or-skip → executeWithRls create with null actor
   ("Sistema"), and the RETURN-on-expected-skip vs THROW-on-real-failure discipline (a throw
   is caught by DomainEventsService.markFailed so the audit row turns FAILED and the retry
   cron picks it up).

   DECOUPLING: reads ONLY the event payload — never a Comercial table (opportunity/quote).
   The payment term rides in the payload (COM-013b emit) so even the term is not a Comercial
   read. */
const SOURCE_TYPE = 'comercial_opportunity_won';
const HANDLER = 'comercial-income-commitment';

@Injectable()
export class OpportunityCommitmentListener {
  private readonly logger = new Logger(OpportunityCommitmentListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rls: RlsService,
    private readonly alertSettings: CompanyAlertSettingsService,
  ) {}

  /* Anchor the handoff instant to UTC midnight and add the payment-term days, so the
     @db.Date dueDate never suffers the timezone off-by-one (the RRHH HR-004b convention,
     matching the Comercial emitter's toDateOnly). setUTCDate rolls month/year boundaries
     correctly (e.g. Dec 20 + 30d → Jan 19 of the next year). */
  private projectedDueDate(occurredAtIso: string, paymentTermDays: number): Date {
    const d = new Date(occurredAtIso);
    const due = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    due.setUTCDate(due.getUTCDate() + paymentTermDays);
    return due;
  }

  @OnEvent('comercial.opportunity-won')
  async handleOpportunityWon(event: ComercialOpportunityWonEvent) {
    /* Enable toggle — reuse the SAME company-wide enableAutoCommitments the renewal handler
       uses. If auto-commitments are off, skip (return, don't throw). No independent income
       toggle in V1 (a per-type toggle is a future refinement). */
    const settings = await this.alertSettings.getOrCreate(event.companyId, null);
    if (!settings.enableAutoCommitments) {
      return { handler: HANDLER, skipped: 'auto-commitments disabled' };
    }

    /* IDEMPOTENCY — one un-fulfilled projected-income commitment per opportunity. A
       re-delivered event (double-emit / retry) re-attaches to the existing row instead of
       minting a second. Keyed on (sourceType, sourceId=opportunityId), independent of the
       Operaciones ServiceOrder listener's own dedupe. */
    const existing = await this.prisma.commitment.findFirst({
      where: {
        companyId: event.companyId,
        sourceType: SOURCE_TYPE,
        sourceId: event.opportunityId,
        autoFulfilledAt: null,
      },
      select: { id: true },
    });
    if (existing) {
      return { handler: HANDLER, skipped: 'commitment exists', commitmentId: existing.id };
    }

    /* dueDate = handoff date (occurredAt) + the account's payment term. This is a CASH-FLOW
       PROJECTION (an ESTIMATE): the invoice does not exist yet in this flow (invoice
       emission + SII is a separate future concern), so the real invoice-based date is V2. */
    const dueDate = this.projectedDueDate(event.occurredAt, event.paymentTermDays);

    /* The cashflow requires a FiscalPeriod for the dueDate; skip gracefully if the operator
       hasn't created it yet. The ServiceOrder still got created by the other listener — only
       the income projection waits for the period. */
    const period = await this.prisma.fiscalPeriod.findFirst({
      where: {
        companyId: event.companyId,
        year: dueDate.getUTCFullYear(),
        month: dueDate.getUTCMonth() + 1,
      },
      select: { id: true },
    });
    if (!period) {
      this.logger.warn(
        `[finance] ${HANDLER} skipped — no fiscal period for ${dueDate.toISOString().slice(0, 10)} (company ${event.companyId})`,
      );
      return { handler: HANDLER, skipped: 'no fiscal period' };
    }

    /* RLS write with null actor = "Sistema" (no human behind the row; the audit trigger
       maps a NULL changedBy to "Sistema"). A genuine create failure THROWS → markFailed →
       retry cron. */
    try {
      const commitment = await this.rls.executeWithRls(event.companyId, null, async (tx) =>
        tx.commitment.create({
          data: {
            companyId: event.companyId,
            fiscalPeriodId: period.id,
            type: 'INCOME',
            /* GROSS the client will pay (net + IVA) — that's the cash actually collected into
               the company's account. IVA is later remitted to SII as a separate outflow (a
               future concern), so the income cash-flow projection uses the total. */
            amount: new Prisma.Decimal(event.totalAmount),
            currency: event.currency,
            dueDate,
            counterpartyId: event.counterpartyId, // may be null (carried from the payload)
            categoryId: null, // no income template in V1 — Commitment.categoryId is optional
            description: `Ingreso proyectado: ${event.title} — cobro estimado a ${event.paymentTermDays} días (estimación; fecha real por factura en V2).`,
            status: 'PENDING',
            sourceType: SOURCE_TYPE,
            sourceId: event.opportunityId,
            sourceMetadata: {
              opportunityId: event.opportunityId,
              quoteId: event.quoteId,
              clientName: event.clientName,
              paymentTermDays: event.paymentTermDays,
              net: event.netAmount,
              tax: event.taxAmount,
              total: event.totalAmount,
            } as Prisma.InputJsonValue,
            isAutoGenerated: true,
          },
          select: { id: true },
        }),
      );
      this.logger.log(
        `[finance] ${HANDLER} ${commitment.id} created for opportunity ${event.opportunityId} (due ${dueDate.toISOString().slice(0, 10)})`,
      );
      return { handler: HANDLER, commitmentId: commitment.id };
    } catch (err) {
      this.logger.error(
        `[finance] ${HANDLER} creation failed: ${err instanceof Error ? err.message : err}`,
      );
      throw err;
    }
  }
}
