import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type {
  AssetBlockedEvent,
  AssetUnblockedEvent,
  DocumentRenewalImminentEvent,
  OperationalCostEvent,
  PermitRenewalImminentEvent,
  ProcedureAcknowledgmentExpiredEvent,
  WorkPermitClosedEvent,
} from '../operations/events/domain-event-types';

/* OPS-032 — Finance side of the Operations → Finance bus. Today
   each handler is an observer (logs only) so we can wire the
   infrastructure end-to-end without changing financial state.
   OPS-033 will fill these handlers with real logic (auto-creating
   commitments, flagging revenue at risk, etc).

   Each handler is intentionally tolerant: a thrown error here is
   caught by DomainEventsService.markFailed so the audit row turns
   FAILED and the retry cron picks it up. We never crash the
   emitter.

   Returning a small structured result lets the audit page show
   per-handler outcomes once OPS-033 lands real consumers. */

@Injectable()
export class OperationsListenersService {
  private readonly logger = new Logger(OperationsListenersService.name);

  @OnEvent('document.renewal-imminent')
  async handleDocumentRenewal(event: DocumentRenewalImminentEvent) {
    this.logger.log(
      `[finance] document.renewal-imminent — ${event.documentTypeCode} on ${event.assetCode} expires in ${event.daysRemaining}d (critical=${event.isCritical}, blocks=${event.blocksOperation})`,
    );
    /* OPS-033: create a future cash commitment with category =
       "Renovaciones documentales", amount = estimatedCost, dueDate
       = expirationDate. */
    return { handler: 'finance.document-renewal', noop: true };
  }

  @OnEvent('asset.blocked')
  async handleAssetBlocked(event: AssetBlockedEvent) {
    this.logger.log(
      `[finance] asset.blocked — ${event.assetCode} (was ${event.previousStatus}) — ${event.reason}`,
    );
    /* OPS-033: flag the asset as revenue-at-risk if it's classified
       as a producing asset. */
    return { handler: 'finance.asset-blocked', noop: true };
  }

  @OnEvent('asset.unblocked')
  async handleAssetUnblocked(event: AssetUnblockedEvent) {
    this.logger.log(
      `[finance] asset.unblocked — ${event.assetCode} ${event.previousStatus} → ${event.newStatus}`,
    );
    return { handler: 'finance.asset-unblocked', noop: true };
  }

  @OnEvent('permit.renewal-imminent')
  async handlePermitRenewal(event: PermitRenewalImminentEvent) {
    this.logger.log(
      `[finance] permit.renewal-imminent — ${event.permitNumber} (${event.permitTypeCode}) expires in ${event.daysRemaining}d`,
    );
    /* OPS-033: same shape as document renewal but a different
       commitment category. */
    return { handler: 'finance.permit-renewal', noop: true };
  }

  @OnEvent('work-permit.closed')
  async handleWorkPermitClosed(event: WorkPermitClosedEvent) {
    this.logger.log(
      `[finance] work-permit.closed — ${event.permitNumber} (${event.permitType}) actual=${event.actualDuration}h planned=${event.plannedDuration}h incidents=${event.incidentsReported}`,
    );
    /* OPS-033: when a future ticket adds cost capture on close, we
       can fan-out to OperationalCostEvent here. */
    return { handler: 'finance.work-permit-closed', noop: true };
  }

  @OnEvent('procedure.acknowledgment-expired')
  async handleAckExpired(event: ProcedureAcknowledgmentExpiredEvent) {
    this.logger.log(
      `[finance] procedure.acknowledgment-expired — ${event.procedureCode} for ${event.userEmail}`,
    );
    /* No financial side-effect today. The compliance dashboard
       already covers this gap, but we still want the audit trail
       so OPS-033 can decide whether to escalate it. */
    return { handler: 'finance.ack-expired', noop: true };
  }

  @OnEvent('operational.cost')
  async handleOperationalCost(event: OperationalCostEvent) {
    this.logger.log(
      `[finance] operational.cost — ${event.sourceType}/${event.sourceId} ${event.amount ?? 'n/a'} (${event.description})`,
    );
    /* OPS-033: write directly into Commitment with type = EXPENSE
       and the matching category. */
    return { handler: 'finance.operational-cost', noop: true };
  }
}
