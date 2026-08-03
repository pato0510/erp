/* COM-013b — proves the comercial.opportunity-won registry entry: the two switch helpers
 * resolve aggregateType='Opportunity' and aggregateId=the RAW opportunity UUID (NOT a
 * composite string — that is the acknowledgment-expired landmine that makes emit() swallow
 * the @db.Uuid row). Exhaustiveness of the switches is enforced by the compiler. */
import {
  aggregateIdForEvent,
  aggregateTypeForEvent,
  ComercialOpportunityWonEvent,
  EVENT_TYPES,
  ProcedureAcknowledgmentExpiredEvent,
} from './domain-event-types';

const event: ComercialOpportunityWonEvent = {
  type: 'comercial.opportunity-won',
  companyId: 'c1',
  occurredAt: '2026-07-08T12:00:00.000Z',
  opportunityId: '11111111-2222-3333-4444-555555555555',
  quoteId: 'q1',
  clientName: 'Minera Los Andes SpA',
  counterpartyId: null,
  title: 'Servicio de aseo faena norte',
  description: null,
  scopeLines: [{ serviceName: 'Aseo mensual', quantity: 2, unitPrice: 10000, lineTotal: 20000 }],
  netAmount: 20000,
  taxAmount: 3800,
  totalAmount: 23800,
  currency: 'CLP',
  ownerId: 'owner1',
  paymentTermDays: 30,
};

describe('COM-013b — comercial.opportunity-won registry entry', () => {
  it('aggregateTypeForEvent → Opportunity', () => {
    expect(aggregateTypeForEvent(event)).toBe('Opportunity');
  });

  it('aggregateIdForEvent → the RAW opportunity UUID (never a composite string)', () => {
    const id = aggregateIdForEvent(event);
    expect(id).toBe('11111111-2222-3333-4444-555555555555');
    expect(id).not.toContain(':'); // guard against the acknowledgment-expired composite landmine
  });

  it('is registered in EVENT_TYPES', () => {
    expect(EVENT_TYPES).toContain('comercial.opportunity-won');
  });

  /* OPS-038 — pins the formerly guilty case itself: aggregateId is the acknowledgment
     row's own UUID PK, never the procedureId:userId composite that made emit() swallow
     every row since OPS-032. */
  it('aggregateIdForEvent(acknowledgment-expired) → the acknowledgmentId verbatim (never a composite string)', () => {
    const ackEvent: ProcedureAcknowledgmentExpiredEvent = {
      type: 'procedure.acknowledgment-expired',
      companyId: 'c1',
      acknowledgmentId: '66666666-7777-8888-9999-aaaaaaaaaaaa',
      procedureId: 'p1',
      procedureCode: 'PROC-001',
      procedureTitle: 'Procedimiento de prueba',
      userId: 'u1',
      userEmail: 'user@excelsia.dev',
      occurredAt: '2026-08-03T12:00:00.000Z',
    };
    const id = aggregateIdForEvent(ackEvent);
    expect(id).toBe('66666666-7777-8888-9999-aaaaaaaaaaaa');
    expect(id).not.toContain(':'); // the composite landmine, pinned on the case that had it
  });
});
