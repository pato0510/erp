/* COM-013b — proves the comercial.opportunity-won registry entry: the two switch helpers
 * resolve aggregateType='Opportunity' and aggregateId=the RAW opportunity UUID (NOT a
 * composite string — that is the acknowledgment-expired landmine that makes emit() swallow
 * the @db.Uuid row). Exhaustiveness of the switches is enforced by the compiler. */
import {
  aggregateIdForEvent,
  aggregateTypeForEvent,
  ComercialOpportunityWonEvent,
  EVENT_TYPES,
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
});
