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
 *  Aggregate: ProcedureAcknowledgment
 *  Consumed by: Finance OPS-033 → currently no-op (logged for
 *  compliance dashboards). */
export interface ProcedureAcknowledgmentExpiredEvent {
  type: 'procedure.acknowledgment-expired';
  companyId: string;
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

/** The full union — switch on `type` to narrow the payload. */
export type OperationsDomainEvent =
  | DocumentRenewalImminentEvent
  | AssetBlockedEvent
  | AssetUnblockedEvent
  | OperationalCostEvent
  | PermitRenewalImminentEvent
  | ProcedureAcknowledgmentExpiredEvent
  | WorkPermitClosedEvent;

/** Aggregate-type hints used when persisting the event row. The
 *  `aggregateType` column is opaque to consumers but we standardize
 *  these strings so admins can filter the audit table by entity. */
export const AGGREGATE_TYPES = {
  DocumentRecord: 'DocumentRecord',
  Permit: 'Permit',
  OperationalAsset: 'OperationalAsset',
  WorkPermit: 'WorkPermit',
  ProcedureAcknowledgment: 'ProcedureAcknowledgment',
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
      /* Compose a stable key — no single id identifies a per-user
         per-procedure acknowledgment in the event surface. */
      return `${event.procedureId}:${event.userId}`;
    case 'operational.cost':
      return event.sourceId;
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
] as const;

export type EventTypeName = (typeof EVENT_TYPES)[number];
