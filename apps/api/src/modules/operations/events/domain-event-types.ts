/* OPS-032 — typed event surface for the Operations domain bus.
   Each event carries everything a Finance/HSEC handler needs to
   react without round-tripping back to Operations.

   Idempotency: every event is persisted with a UNIQUE constraint on
   (companyId, eventType, aggregateId, occurredAt) — emitters that
   stamp the same `occurredAt` for the same aggregate get a single
   row, not duplicates. */

/** Document approaches its expirationDate.
 *  Emitted by: alert-engine when an approved document falls inside
 *  its alertDaysBefore window, exactly once per (record, day) tuple.
 *  Aggregate: DocumentRecord
 *  Consumed by: Finance OPS-033 → creates renewal commitment. */
export interface DocumentRenewalImminentEvent {
  type: 'document.renewal-imminent';
  companyId: string;
  documentRecordId: string;
  documentTypeId: string;
  documentTypeCode: string;
  documentTypeName: string;
  assetId: string;
  assetCode: string;
  assetName: string;
  expirationDate: string;
  daysRemaining: number;
  isCritical: boolean;
  blocksOperation: boolean;
  estimatedCost?: number;
  occurredAt: string;
}

/** Asset transitioned into BLOCKED_DOCUMENTAL.
 *  Emitted by: AssetBlockingService.processBlocking after AUTO_BLOCK.
 *  Aggregate: OperationalAsset
 *  Consumed by: Finance OPS-033 → flags revenue at risk. */
export interface AssetBlockedEvent {
  type: 'asset.blocked';
  companyId: string;
  assetId: string;
  assetCode: string;
  assetName: string;
  previousStatus: string;
  reason: string;
  blockingDocumentTypeIds: string[];
  occurredAt: string;
}

/** Asset returned to OPERATIONAL after being blocked.
 *  Emitted by: AssetBlockingService.processBlocking after AUTO_UNBLOCK.
 *  Aggregate: OperationalAsset
 *  Consumed by: Finance OPS-033 → clears revenue-at-risk flag. */
export interface AssetUnblockedEvent {
  type: 'asset.unblocked';
  companyId: string;
  assetId: string;
  assetCode: string;
  assetName: string;
  previousStatus: string;
  newStatus: string;
  reason: string;
  occurredAt: string;
}

/** Free-form operational cost emission. Lets a feature emit a
 *  single-fire "this work happened, here's an amount" event without
 *  inventing a specific event type for it.
 *  Emitted by: ad-hoc (e.g. WorkPermitsService.close when a future
 *  ticket adds cost capture).
 *  Aggregate: variable (encoded in sourceType+sourceId).
 *  Consumed by: Finance OPS-033 → creates expense commitment. */
export interface OperationalCostEvent {
  type: 'operational.cost';
  companyId: string;
  sourceType: 'work_permit' | 'maintenance' | 'other';
  sourceId: string;
  description: string;
  amount?: number;
  costCategoryHint?: string;
  assetId?: string;
  occurredAt: string;
}

/** External permit approaches its expirationDate. Same shape as
 *  document renewal but scoped to the Permit table.
 *  Emitted by: alert-engine when an approved permit falls inside its
 *  alertDaysBefore window.
 *  Aggregate: Permit
 *  Consumed by: Finance OPS-033 → creates renewal commitment. */
export interface PermitRenewalImminentEvent {
  type: 'permit.renewal-imminent';
  companyId: string;
  permitId: string;
  permitTypeCode: string;
  permitTypeName: string;
  permitNumber: string;
  expirationDate: string;
  daysRemaining: number;
  estimatedCost?: number;
  occurredAt: string;
}

/** A pending procedure acknowledgment passed its dueDate without
 *  the user signing.
 *  Emitted by: AcknowledgmentsService.processExpiredForAllCompanies.
 *  Aggregate: ProcedureAcknowledgment (aggregateId = acknowledgmentId,
 *  the row's own UUID PK — OPS-038; the earlier composite
 *  procedureId:userId string made emit() swallow every row).
 *  Consumed by: Finance OPS-033 → currently no-op (logged for
 *  compliance dashboards). */
export interface ProcedureAcknowledgmentExpiredEvent {
  type: 'procedure.acknowledgment-expired';
  companyId: string;
  /** The acknowledgment row's own UUID PK — the aggregate identity. */
  acknowledgmentId: string;
  procedureId: string;
  procedureCode: string;
  procedureTitle: string;
  userId: string;
  userEmail: string;
  occurredAt: string;
}

/** Work permit closed (cleanly or with incidents).
 *  Emitted by: WorkPermitsService.close after the row flips to CLOSED.
 *  Aggregate: WorkPermit
 *  Consumed by: Finance OPS-033 → emits OperationalCostEvent if
 *  closure included cost capture. */
export interface WorkPermitClosedEvent {
  type: 'work-permit.closed';
  companyId: string;
  workPermitId: string;
  permitNumber: string;
  permitType: string;
  title: string;
  /** Hours, planned span (plannedEnd − plannedStart). */
  plannedDuration: number;
  /** Hours, actual span (actualEnd − actualStart). 0 when not tracked. */
  actualDuration: number;
  incidentsReported: boolean;
  assetId?: string;
  occurredAt: string;
}

/** COM-013b — a WON Comercial opportunity handed off to Operaciones. Emitted by the
 *  Comercial side (OpportunitiesService.sendToOperations) when the operator sends a
 *  GANADA opportunity with an accepted quote to Operaciones.
 *  Aggregate: Opportunity (aggregateId = opportunityId, a real UUID — NEVER a composite
 *  string, or emit() would silently swallow the row).
 *  Consumed by: Operaciones ServiceOrderHandoffListener → creates the ServiceOrder from
 *  this SELF-CONTAINED payload (the listener never reads Comercial tables — the two
 *  modules stay decoupled); AND Finance OpportunityCommitmentListener (COM-014) → creates
 *  the projected-income Commitment (dueDate = occurredAt + paymentTermDays). Both listeners
 *  fire independently on this one event and each dedupes on its own side. `occurredAt` is a
 *  STABLE timestamp set once at handoff and reused as the event's idempotency key, so a
 *  re-emit dedupes instead of duplicating. */
export interface ComercialOpportunityWonEvent {
  type: 'comercial.opportunity-won';
  companyId: string;
  occurredAt: string;
  opportunityId: string;
  quoteId: string;
  clientName: string;
  counterpartyId: string | null;
  title: string;
  description: string | null;
  scopeLines: { serviceName: string; quantity: number; unitPrice: number; lineTotal: number }[];
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  ownerId: string | null;
  /* COM-014 — the account's payment term (days after invoice emission) carried in the
     payload so the Finance listener stays payload-only (never reads the accounts table),
     consistent with the ServiceOrder listener's decoupling. */
  paymentTermDays: number;
}

/** The full union — switch on `type` to narrow the payload. */
export type OperationsDomainEvent =
  | DocumentRenewalImminentEvent
  | AssetBlockedEvent
  | AssetUnblockedEvent
  | OperationalCostEvent
  | PermitRenewalImminentEvent
  | ProcedureAcknowledgmentExpiredEvent
  | WorkPermitClosedEvent
  | ComercialOpportunityWonEvent;

/** Aggregate-type hints used when persisting the event row. The
 *  `aggregateType` column is opaque to consumers but we standardize
 *  these strings so admins can filter the audit table by entity. */
export const AGGREGATE_TYPES = {
  DocumentRecord: 'DocumentRecord',
  Permit: 'Permit',
  OperationalAsset: 'OperationalAsset',
  WorkPermit: 'WorkPermit',
  ProcedureAcknowledgment: 'ProcedureAcknowledgment',
  Opportunity: 'Opportunity',
  Other: 'Other',
} as const;

/** Mapping from event union to the aggregate type written to the
 *  audit row. Centralized so future event types stay consistent. */
export function aggregateTypeForEvent(event: OperationsDomainEvent): string {
  switch (event.type) {
    case 'document.renewal-imminent':
      return AGGREGATE_TYPES.DocumentRecord;
    case 'permit.renewal-imminent':
      return AGGREGATE_TYPES.Permit;
    case 'asset.blocked':
    case 'asset.unblocked':
      return AGGREGATE_TYPES.OperationalAsset;
    case 'work-permit.closed':
      return AGGREGATE_TYPES.WorkPermit;
    case 'procedure.acknowledgment-expired':
      return AGGREGATE_TYPES.ProcedureAcknowledgment;
    case 'operational.cost':
      return AGGREGATE_TYPES.Other;
    case 'comercial.opportunity-won':
      return AGGREGATE_TYPES.Opportunity;
  }
}

export function aggregateIdForEvent(event: OperationsDomainEvent): string {
  switch (event.type) {
    case 'document.renewal-imminent':
      return event.documentRecordId;
    case 'permit.renewal-imminent':
      return event.permitId;
    case 'asset.blocked':
    case 'asset.unblocked':
      return event.assetId;
    case 'work-permit.closed':
      return event.workPermitId;
    case 'procedure.acknowledgment-expired':
      /* OPS-038 — the acknowledgment row's own UUID PK. The original composite
         `${procedureId}:${userId}` violated the rule below: aggregateId is a
         @db.Uuid column, so a composite STRING makes emit() silently swallow
         the row — every emission since OPS-032 persisted nothing. General
         landmine for future event authors: aggregateId must ALWAYS be a real
         UUID, never a composed string. */
      return event.acknowledgmentId;
    case 'operational.cost':
      return event.sourceId;
    case 'comercial.opportunity-won':
      /* MUST be the raw opportunity UUID — aggregateId is a @db.Uuid column, so a
         composite string would make emit() silently swallow the row (the landmine). */
      return event.opportunityId;
  }
}

/** Enumerated event type strings — useful for the audit page filter
 *  dropdown. Listed in stable order for the UI. */
export const EVENT_TYPES = [
  'document.renewal-imminent',
  'permit.renewal-imminent',
  'asset.blocked',
  'asset.unblocked',
  'work-permit.closed',
  'procedure.acknowledgment-expired',
  'operational.cost',
  'comercial.opportunity-won',
] as const;

export type EventTypeName = (typeof EVENT_TYPES)[number];
