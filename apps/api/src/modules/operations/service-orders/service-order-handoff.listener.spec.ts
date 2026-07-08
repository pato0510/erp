/* COM-013b — proves the Operaciones listener: it creates a ServiceOrder from the event
 * PAYLOAD ONLY (never reads Comercial tables), dedupes a re-delivered event on
 * sourceOpportunityId (RETURN, no duplicate), and lets a real createFromHandoff failure
 * THROW (so DomainEventsService marks it FAILED and the retry cron fires). */
import { ComercialOpportunityWonEvent } from '../events/domain-event-types';
import { ServiceOrderHandoffListener } from './service-order-handoff.listener';

type Any = Record<string, unknown>;

const event: ComercialOpportunityWonEvent = {
  type: 'comercial.opportunity-won',
  companyId: 'c1',
  occurredAt: '2026-07-08T12:00:00.000Z',
  opportunityId: 'opp1',
  quoteId: 'q1',
  clientName: 'Minera Los Andes SpA',
  counterpartyId: 'cp1',
  title: 'Servicio de aseo faena norte',
  description: 'notas',
  scopeLines: [{ serviceName: 'Aseo mensual', quantity: 2, unitPrice: 10000, lineTotal: 20000 }],
  netAmount: 20000,
  taxAmount: 3800,
  totalAmount: 23800,
  currency: 'CLP',
  ownerId: 'owner1',
  paymentTermDays: 30, // COM-014 — carried in the payload; the ServiceOrder listener ignores it
};

function makeListener(opts: { existing?: Any | null; createThrows?: boolean } = {}) {
  const findBySourceOpportunity = jest.fn(() => Promise.resolve(opts.existing ?? null));
  const createFromHandoff = jest.fn((_c: string, input: Any) => {
    if (opts.createThrows) return Promise.reject(new Error('db down'));
    return Promise.resolve({ id: 'so1', orderNumber: 'OS-0001', ...input });
  });
  const svc = { findBySourceOpportunity, createFromHandoff } as never;
  return {
    listener: new ServiceOrderHandoffListener(svc),
    findBySourceOpportunity,
    createFromHandoff,
  };
}

describe('ServiceOrderHandoffListener', () => {
  it('creates a ServiceOrder from the payload (mapped fields + provenance + null system createdBy)', async () => {
    const { listener, createFromHandoff } = makeListener();
    const res = (await listener.handleOpportunityWon(event)) as Any;
    expect(createFromHandoff).toHaveBeenCalledTimes(1);
    const [companyId, input] = createFromHandoff.mock.calls[0] as [string, Any];
    expect(companyId).toBe('c1');
    expect(input).toEqual({
      clientName: 'Minera Los Andes SpA',
      counterpartyId: 'cp1',
      title: 'Servicio de aseo faena norte',
      description: 'notas',
      scopeLines: event.scopeLines,
      netAmount: 20000,
      taxAmount: 3800,
      totalAmount: 23800,
      currency: 'CLP',
      ownerId: 'owner1',
      sourceOpportunityId: 'opp1',
      sourceQuoteId: 'q1',
      createdBy: null,
    });
    expect(res.created).toBe('so1');
  });

  it('DEDUPES a re-delivered event (same sourceOpportunityId) — returns skipped, no duplicate', async () => {
    const { listener, createFromHandoff } = makeListener({ existing: { id: 'soX' } });
    const res = (await listener.handleOpportunityWon(event)) as Any;
    expect(res).toEqual({ skipped: 'service order exists', serviceOrderId: 'soX' });
    expect(createFromHandoff).not.toHaveBeenCalled();
  });

  it('THROWS on a real createFromHandoff failure (so markFailed + retry fire)', async () => {
    const { listener } = makeListener({ createThrows: true });
    await expect(listener.handleOpportunityWon(event)).rejects.toThrow('db down');
  });
});
