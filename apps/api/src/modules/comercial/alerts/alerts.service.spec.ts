/* ALERT-001 — proves the three definitions and their boundaries: a quote sent EXACTLY 7
 * days ago is unanswered, 6.99 days is not; an open opportunity untouched EXACTLY 14 days
 * is stale, 13.99 is not; EN_PAUSA / GANADA / PERDIDA never appear; overdue uses the
 * CHILEAN date (a close date equal to Santiago-today is NOT overdue even when UTC is
 * already tomorrow); an opportunity can sit in both lists; summary issues no list
 * queries (count + id-select only); every fake call carries the explicit companyId.
 * Fake timers pin "now". */
import { AlertsService, QUOTE_UNANSWERED_DAYS, STALE_OPPORTUNITY_DAYS } from './alerts.service';

type Any = Record<string, unknown>;
const DAY = 24 * 60 * 60 * 1000;
// 2026-09-18T01:00Z = 2026-09-17 22:00 in Santiago (UTC-3): Santiago-today is the 17th.
const NOW = new Date('2026-09-18T01:00:00.000Z');
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

interface Quote {
  id: string;
  companyId: string;
  status: string;
  sentAt: Date | null;
  oppId: string;
}
interface Opp {
  id: string;
  companyId: string;
  stage: string;
  name?: string;
  ownerId?: string | null;
  expectedCloseDate?: Date | null;
  last?: Date;
}

function makeService(quotes: Quote[], opps: Opp[]) {
  const calls: Any[] = [];
  const stageIn = (o: Opp, w: Any) => {
    const st = w.stage as Any | undefined;
    return !st || (st.in as string[]).includes(o.stage);
  };
  const quoteMatch = (q: Quote, w: Any) =>
    q.companyId === w.companyId &&
    (w.status === undefined || q.status === w.status) &&
    (w.sentAt === undefined ||
      (q.sentAt !== null && q.sentAt.getTime() <= ((w.sentAt as Any).lte as Date).getTime()));
  const oppMatch = (o: Opp, w: Any) =>
    o.companyId === w.companyId &&
    stageIn(o, w) &&
    (w.expectedCloseDate === undefined ||
      (o.expectedCloseDate != null &&
        o.expectedCloseDate < ((w.expectedCloseDate as Any).lt as Date)));
  const prisma = {
    quote: {
      count: jest.fn((args: Any) => {
        calls.push({ model: 'quote.count', where: args.where });
        return Promise.resolve(quotes.filter((q) => quoteMatch(q, args.where as Any)).length);
      }),
      findMany: jest.fn((args: Any) => {
        calls.push({ model: 'quote.findMany', where: args.where });
        return Promise.resolve(
          quotes
            .filter((q) => quoteMatch(q, args.where as Any))
            .sort((a, b) => (a.sentAt as Date).getTime() - (b.sentAt as Date).getTime())
            .map((q) => ({
              id: q.id,
              quoteNumber: `COT-${q.id}`,
              sentAt: q.sentAt,
              opportunity: {
                id: q.oppId,
                name: `Opp ${q.oppId}`,
                account: { id: 'acc1', name: 'Minera' },
              },
            })),
        );
      }),
    },
    opportunity: {
      count: jest.fn((args: Any) => {
        calls.push({ model: 'opportunity.count', where: args.where });
        return Promise.resolve(opps.filter((o) => oppMatch(o, args.where as Any)).length);
      }),
      findMany: jest.fn((args: Any) => {
        calls.push({ model: 'opportunity.findMany', where: args.where, select: args.select });
        return Promise.resolve(
          opps
            .filter((o) => oppMatch(o, args.where as Any))
            .map((o) => ({
              id: o.id,
              name: o.name ?? `Opp ${o.id}`,
              stage: o.stage,
              ownerId: o.ownerId ?? null,
              expectedCloseDate: o.expectedCloseDate ?? null,
              accountId: 'acc1',
              account: { name: 'Minera' },
            })),
        );
      }),
    },
  } as unknown as ConstructorParameters<typeof AlertsService>[0];
  const lastMovementByOpportunity = jest.fn((companyId: string, ids: string[]) => {
    calls.push({ model: 'lastMovementByOpportunity', where: { companyId }, ids });
    const m = new Map<string, Date>();
    for (const o of opps) if (ids.includes(o.id) && o.last) m.set(o.id, o.last);
    return Promise.resolve(m);
  });
  const opportunities = { lastMovementByOpportunity } as unknown as ConstructorParameters<
    typeof AlertsService
  >[1];
  return {
    svc: new AlertsService(prisma, opportunities),
    calls,
    prisma,
    lastMovementByOpportunity,
  };
}

beforeAll(() => {
  jest.useFakeTimers({ now: NOW });
});
afterAll(() => {
  jest.useRealTimers();
});

const openOpp = (id: string, over: Partial<Opp> = {}): Opp => ({
  id,
  companyId: 'c1',
  stage: 'NEGOCIACION',
  last: ago(1),
  ...over,
});

describe('AlertsService — quotesUnanswered', () => {
  it('ENVIADA quotes sent ≥ 7 days ago, oldest first; answered/draft/foreign excluded', async () => {
    const { svc } = makeService(
      [
        { id: 'q-old', companyId: 'c1', status: 'ENVIADA', sentAt: ago(20), oppId: 'o1' },
        {
          id: 'q-exact',
          companyId: 'c1',
          status: 'ENVIADA',
          sentAt: ago(QUOTE_UNANSWERED_DAYS),
          oppId: 'o1',
        },
        { id: 'q-fresh', companyId: 'c1', status: 'ENVIADA', sentAt: ago(6.99), oppId: 'o1' },
        { id: 'q-accepted', companyId: 'c1', status: 'ACEPTADA', sentAt: ago(30), oppId: 'o1' },
        { id: 'q-draft', companyId: 'c1', status: 'BORRADOR', sentAt: null, oppId: 'o1' },
        { id: 'q-foreign', companyId: 'OTHER', status: 'ENVIADA', sentAt: ago(30), oppId: 'o1' },
      ],
      [],
    );
    const res = (await svc.getAlerts('c1', false)) as Any;
    const list = res.quotesUnanswered as Any[];
    expect(list.map((q) => q.quoteId)).toEqual(['q-old', 'q-exact']);
    expect(list[0]).toMatchObject({
      quoteNumber: 'COT-q-old',
      opportunityName: 'Opp o1',
      accountName: 'Minera',
      days: 20,
    });
    expect(list[1].days).toBe(QUOTE_UNANSWERED_DAYS);
  });
});

describe('AlertsService — staleOpportunities', () => {
  it('open opportunities untouched ≥ 14 days, oldest first; EN_PAUSA and closed excluded', async () => {
    const { svc } = makeService(
      [],
      [
        openOpp('s-exact', { last: ago(STALE_OPPORTUNITY_DAYS) }),
        openOpp('s-old', { last: ago(40) }),
        openOpp('fresh', { last: ago(13.99) }),
        openOpp('paused', { stage: 'EN_PAUSA', last: ago(60) }),
        openOpp('won', { stage: 'GANADA', last: ago(60) }),
        openOpp('lost', { stage: 'PERDIDA', last: ago(60) }),
        openOpp('foreign', { companyId: 'OTHER', last: ago(60) }),
      ],
    );
    const res = (await svc.getAlerts('c1', false)) as Any;
    const list = res.staleOpportunities as Any[];
    expect(list.map((o) => o.opportunityId)).toEqual(['s-old', 's-exact']);
    expect(list[0]).toMatchObject({ days: 40, stage: 'NEGOCIACION', accountName: 'Minera' });
    expect(list[1].days).toBe(STALE_OPPORTUNITY_DAYS);
  });
});

describe('AlertsService — overdueClose (Santiago today)', () => {
  it('expectedCloseDate < Santiago-today only; most overdue first; EN_PAUSA excluded', async () => {
    const { svc } = makeService(
      [],
      [
        // Santiago-today is 2026-09-17 while UTC is already the 18th: NOT overdue.
        openOpp('today-cl', { expectedCloseDate: new Date('2026-09-17T00:00:00.000Z') }),
        openOpp('yesterday', { expectedCloseDate: new Date('2026-09-16T00:00:00.000Z') }),
        openOpp('week', { expectedCloseDate: new Date('2026-09-10T00:00:00.000Z') }),
        openOpp('none', { expectedCloseDate: null }),
        openOpp('paused', {
          stage: 'EN_PAUSA',
          expectedCloseDate: new Date('2026-01-01T00:00:00.000Z'),
        }),
      ],
    );
    const res = (await svc.getAlerts('c1', false)) as Any;
    const list = res.overdueClose as Any[];
    expect(list.map((o) => o.opportunityId)).toEqual(['week', 'yesterday']);
    expect(list[0]).toMatchObject({ expectedCloseDate: '2026-09-10', daysOverdue: 7 });
    expect(list[1].daysOverdue).toBe(1);
  });
});

describe('AlertsService — composition', () => {
  it('an opportunity can appear in BOTH opportunity lists; counts + total match', async () => {
    const { svc } = makeService(
      [{ id: 'q1', companyId: 'c1', status: 'ENVIADA', sentAt: ago(10), oppId: 'both' }],
      [openOpp('both', { last: ago(30), expectedCloseDate: new Date('2026-09-01T00:00:00.000Z') })],
    );
    const res = (await svc.getAlerts('c1', false)) as Any;
    expect((res.staleOpportunities as Any[]).map((o) => o.opportunityId)).toEqual(['both']);
    expect((res.overdueClose as Any[]).map((o) => o.opportunityId)).toEqual(['both']);
    expect(res.counts).toEqual({
      quotesUnanswered: 1,
      staleOpportunities: 1,
      overdueClose: 1,
      total: 3,
    });
  });

  it('summary=true returns only counts, via count queries + an id-only select (no lists)', async () => {
    const { svc, prisma, calls } = makeService(
      [{ id: 'q1', companyId: 'c1', status: 'ENVIADA', sentAt: ago(10), oppId: 'o1' }],
      [
        openOpp('stale', { last: ago(30) }),
        openOpp('due', { expectedCloseDate: new Date('2026-09-01T00:00:00.000Z') }),
      ],
    );
    const res = (await svc.getAlerts('c1', true)) as Any;
    expect(res).toEqual({
      counts: { quotesUnanswered: 1, staleOpportunities: 1, overdueClose: 1, total: 3 },
    });
    const p = prisma as unknown as {
      quote: { findMany: jest.Mock };
      opportunity: { findMany: jest.Mock };
    };
    expect(p.quote.findMany).not.toHaveBeenCalled();
    expect(p.opportunity.findMany).toHaveBeenCalledTimes(1);
    expect(calls.find((c) => c.model === 'opportunity.findMany')?.select).toEqual({ id: true });
  });

  it('EVERY query carries the explicit companyId (full and summary)', async () => {
    for (const summary of [false, true]) {
      const { svc, calls } = makeService(
        [{ id: 'q1', companyId: 'c1', status: 'ENVIADA', sentAt: ago(10), oppId: 'o1' }],
        [openOpp('o1')],
      );
      await svc.getAlerts('c1', summary);
      expect(calls.length).toBeGreaterThan(0);
      for (const c of calls) expect((c.where as Any).companyId).toBe('c1');
    }
  });
});
