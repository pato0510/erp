import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ComercialOpportunityWonEvent } from '../events/domain-event-types';
import { ServiceOrdersService } from './service-orders.service';

/* COM-013b — the Operaciones consumer-side listener for the Comercial→Operaciones
   handoff. Mirrors how finance/operations-listeners hosts the Operations-event handlers:
   the listener lives in the CONSUMER module (Operaciones) and reacts to an event emitted
   by another module (Comercial). It creates the ServiceOrder from the COM-013a
   createFromHandoff seam.

   DECOUPLING: it reads ONLY the event payload — never a Comercial table. The payload is
   self-contained (client, frozen scope, amounts, provenance ids).

   RETURN-vs-THROW discipline (like the reference handler):
   - EXPECTED skip (an order already exists for this opportunity) → RETURN a result (no
     throw) so the retry cron does NOT re-run it. This is what makes re-delivery safe.
   - REAL failure (createFromHandoff throws) → let it PROPAGATE so DomainEventsService
     marks the event FAILED and the retry cron picks it up. */
@Injectable()
export class ServiceOrderHandoffListener {
  private readonly logger = new Logger(ServiceOrderHandoffListener.name);

  constructor(private readonly serviceOrders: ServiceOrdersService) {}

  @OnEvent('comercial.opportunity-won')
  async handleOpportunityWon(event: ComercialOpportunityWonEvent) {
    // IDEMPOTENCY — a re-delivered event (double-emit / retry) must not mint a second
    // order. Guard on (companyId, sourceOpportunityId) BEFORE creating.
    const existing = await this.serviceOrders.findBySourceOpportunity(
      event.companyId,
      event.opportunityId,
    );
    if (existing) {
      return { skipped: 'service order exists', serviceOrderId: existing.id };
    }

    // Create via the COM-013a seam (executeWithRls with null actor = "Sistema"). A real
    // failure THROWS here → markFailed → retry cron (we intentionally do NOT catch it).
    const order = await this.serviceOrders.createFromHandoff(event.companyId, {
      clientName: event.clientName,
      counterpartyId: event.counterpartyId,
      title: event.title,
      description: event.description,
      scopeLines: event.scopeLines,
      netAmount: event.netAmount,
      taxAmount: event.taxAmount,
      totalAmount: event.totalAmount,
      currency: event.currency,
      ownerId: event.ownerId,
      sourceOpportunityId: event.opportunityId,
      sourceQuoteId: event.quoteId,
      createdBy: null, // system-created by the handler
    });
    this.logger.log(
      `Created service order ${order.orderNumber} from opportunity ${event.opportunityId}`,
    );
    return { created: order.id };
  }
}
