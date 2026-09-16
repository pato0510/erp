/* COM-019 — proves the dashboard definitions: won/lost counted by closedAt within the
 * INCLUSIVE range (stage GANADA/PERDIDA); winRate null at a 0 denominator; wonAmount and
 * avgCycleDays from won-in-range; pipelineByStage = open snapshot only, in order, zeros
 * kept; lostAccounts excludes any account with a won-in-range OR an open opportunity;
 * topAccounts ordered by wonAmount; activitiesByType from groupBy; EVERY fake call carries
 * the explicit companyId; parseRange defaults and 400s. Stateful fake Prisma. */
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

type Any = Record<string, unknown>;

interface Opp {
  id: string;
  companyId: string;
  accountId: string;
  accountName: string;
  stage: string;
  estimatedValue: number | null;
  createdAt: string;
  closedAt: string | null;
  lostReason?: string | null;
}

function makeService(
  opps: Opp[],
  activities: { companyId: string; type: string; createdAt: string }[] = [],
) {
  const calls: Any[] = [];
  const inRange = (iso: string | null, r: Any | undefined) => {
    if (!r) return true;
    if (iso === null) return false;
    const t = new Date(iso).getTime();
    return t >= (r.gte as Date).getTime() && t <= (r.lte as Date).getTime();
  };
  const matches = (o: Opp, w: Any) => {
    if (o.companyId !== w.companyId) return false;
    if (typeof w.stage === 'string' && o.stage !== w.stage) return false;
    if (
      w.stage &&
      typeof w.stage === 'object' &&
      !((w.stage as Any).in as string[]).includes(o.stage)
    )
      return false;
    if (w.createdAt && !inRange(o.createdAt, w.createdAt as Any)) return false;
    if (w.closedAt && !inRange(o.closedAt, w.closedAt as Any)) return false;
    return true;
  };
  const opportunity = {
    count: jest.fn((args: Any) => {
      calls.push({ model: 'opportunity.count', where: args.where });
      return Promise.resolve(opps.filter((o) => matches(o, args.where as Any)).length);
    }),
    findMany: jest.fn((args: Any) => {
      calls.push({ model: 'opportunity.findMany', where: args.where });
      return Promise.resolve(
        opps
          .filter((o) => matches(o, args.where as Any))
          .map((o) => ({
            id: o.id,
            accountId: o.accountId,
            stage: o.stage,
            estimatedValue: o.estimatedValue === null ? null : new Prisma.Decimal(o.estimatedValue),
            createdAt: new Date(o.createdAt),
            closedAt: o.closedAt ? new Date(o.closedAt) : null,
            lostReason: o.lostReason ?? null,
            account: { name: o.accountName },
          })),
      );
    }),
  };
  const activity = {
    groupBy: jest.fn((args: Any) => {
      calls.push({ model: 'activity.groupBy', where: args.where });
      const w = args.where as Any;
      const counts = new Map<string, number>();
      for (const a of activities) {
        if (a.companyId !== w.companyId) continue;
        if (!inRange(a.createdAt, w.createdAt as Any)) continue;
        counts.set(a.type, (counts.get(a.type) ?? 0) + 1);
      }
      return Promise.resolve(
        Array.from(counts.entries()).map(([type, n]) => ({ type, _count: { _all: n } })),
      );
    }),
  };
  const prisma = { opportunity, activity } as unknown as ConstructorParameters<
    typeof DashboardService
  >[0];
  return { svc: new DashboardService(prisma), calls };
}

const opp = (over: Partial<Opp> & { id: string }): Opp => ({
  companyId: 'c1',
  accountId: 'acc1',
  accountName: 'Minera',
  stage: 'PROSPECTO',
  estimatedValue: 1000,
  createdAt: '2026-01-01T00:00:00Z',
  closedAt: null,
  ...over,
});

const RANGE = { from: '2026-03-01', to: '2026-03-31' };

describe('DashboardService — parseRange', () => {
  it('defaults to the last 90 days ending today', () => {
    const { svc } = makeService([]);
    const r = svc.parseRange({});
    const today = new Date().toISOString().slice(0, 10);
    expect(r.to).toBe(today);
    expect((r.end.getTime() - r.start.getTime()) / (24 * 60 * 60 * 1000)).toBeCloseTo(90, 1);
  });

  it('to is INCLUSIVE (end = 23:59:59.999Z)', () => {
    const { svc } = makeService([]);
    const r = svc.parseRange(RANGE);
    expect(r.start.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-03-31T23:59:59.999Z');
  });

  it('from > to → 400; range > 3 years → 400', () => {
    const { svc } = makeService([]);
    expect(() => svc.parseRange({ from: '2026-04-01', to: '2026-03-01' })).toThrow(
      BadRequestException,
    );
    expect(() => svc.parseRange({ from: '2020-01-01', to: '2026-03-01' })).toThrow(
      BadRequestException,
    );
  });
});

describe('DashboardQueryDto', () => {
  it('rejects a malformed date, accepts YYYY-MM-DD and empty', async () => {
    expect(await validate(plainToInstance(DashboardQueryDto, { from: '01/03/2026' }))).toHaveLength(
      1,
    );
    expect(
      await validate(plainToInstance(DashboardQueryDto, { from: '2026-03-01', to: '2026-03-31' })),
    ).toHaveLength(0);
    expect(await validate(plainToInstance(DashboardQueryDto, {}))).toHaveLength(0);
  });
});

describe('DashboardService — KPIs', () => {
  it('counts won/lost by closedAt within the inclusive range and computes winRate', async () => {
    const { svc } = makeService([
      opp({ id: 'w1', stage: 'GANADA', closedAt: '2026-03-31T23:30:00Z', estimatedValue: 500 }),
      opp({ id: 'w2', stage: 'GANADA', closedAt: '2026-03-10T00:00:00Z', estimatedValue: 700 }),
      opp({ id: 'w-out', stage: 'GANADA', closedAt: '2026-04-01T00:00:00Z', estimatedValue: 9999 }),
      opp({ id: 'l1', stage: 'PERDIDA', closedAt: '2026-03-15T00:00:00Z', lostReason: 'PRECIO' }),
      opp({
        id: 'l-out',
        stage: 'PERDIDA',
        closedAt: '2026-02-28T23:59:59Z',
        lostReason: 'PRECIO',
      }),
      opp({
        id: 'l-other-co',
        companyId: 'OTHER',
        stage: 'PERDIDA',
        closedAt: '2026-03-15T00:00:00Z',
      }),
      opp({ id: 'c1', createdAt: '2026-03-05T00:00:00Z' }),
    ]);
    const d = await svc.getDashboard('c1', RANGE);
    expect(d.kpis.won).toBe(2);
    expect(d.kpis.lost).toBe(1);
    expect(d.kpis.winRate).toBeCloseTo(2 / 3);
    expect(d.kpis.wonAmount).toBe(1200);
    expect(d.kpis.created).toBe(1);
  });

  it('winRate is null when nothing closed in range', async () => {
    const { svc } = makeService([opp({ id: 'o1' })]);
    const d = await svc.getDashboard('c1', RANGE);
    expect(d.kpis.winRate).toBeNull();
    expect(d.kpis.avgCycleDays).toBeNull();
  });

  it('avgCycleDays = mean of (closedAt − createdAt) in days for won-in-range', async () => {
    const { svc } = makeService([
      opp({
        id: 'w1',
        stage: 'GANADA',
        createdAt: '2026-03-01T00:00:00Z',
        closedAt: '2026-03-11T00:00:00Z',
      }),
      opp({
        id: 'w2',
        stage: 'GANADA',
        createdAt: '2026-03-01T00:00:00Z',
        closedAt: '2026-03-21T00:00:00Z',
      }),
    ]);
    const d = await svc.getDashboard('c1', RANGE);
    expect(d.kpis.avgCycleDays).toBe(15);
  });

  it('open snapshot ignores the range and excludes GANADA/PERDIDA', async () => {
    const { svc } = makeService([
      opp({
        id: 'o1',
        stage: 'NEGOCIACION',
        estimatedValue: 100,
        createdAt: '2025-01-01T00:00:00Z',
      }),
      opp({ id: 'o2', stage: 'EN_PAUSA', estimatedValue: 50 }),
      opp({ id: 'w', stage: 'GANADA', closedAt: '2026-03-10T00:00:00Z' }),
    ]);
    const d = await svc.getDashboard('c1', RANGE);
    expect(d.kpis.openCount).toBe(2);
    expect(d.kpis.openAmount).toBe(150);
  });
});

describe('DashboardService — pipelineByStage', () => {
  it('is the open snapshot in pipeline order with zeros kept, closed stages absent', async () => {
    const { svc } = makeService([
      opp({ id: 'a', stage: 'COTIZACION', estimatedValue: 300 }),
      opp({ id: 'b', stage: 'COTIZACION', estimatedValue: 200 }),
      opp({ id: 'c', stage: 'EN_PAUSA', estimatedValue: 10 }),
      opp({ id: 'w', stage: 'GANADA', closedAt: '2026-03-10T00:00:00Z' }),
    ]);
    const d = await svc.getDashboard('c1', RANGE);
    expect(d.pipelineByStage.map((s) => s.stage)).toEqual([
      'PROSPECTO',
      'CONTACTO',
      'VISITA_TECNICA',
      'COTIZACION',
      'NEGOCIACION',
      'EN_PAUSA',
    ]);
    const cot = d.pipelineByStage.find((s) => s.stage === 'COTIZACION');
    expect(cot).toMatchObject({ label: 'Cotización', count: 2, amount: 500 });
    expect(d.pipelineByStage.find((s) => s.stage === 'PROSPECTO')?.count).toBe(0);
  });
});

describe('DashboardService — lost reasons, lost accounts, top accounts, activities', () => {
  it('lostReasons: top 5 in range with labels', async () => {
    const { svc } = makeService([
      opp({ id: 'l1', stage: 'PERDIDA', closedAt: '2026-03-02T00:00:00Z', lostReason: 'PRECIO' }),
      opp({ id: 'l2', stage: 'PERDIDA', closedAt: '2026-03-03T00:00:00Z', lostReason: 'PRECIO' }),
      opp({
        id: 'l3',
        stage: 'PERDIDA',
        closedAt: '2026-03-04T00:00:00Z',
        lostReason: 'COMPETENCIA',
      }),
    ]);
    const d = await svc.getDashboard('c1', RANGE);
    expect(d.lostReasons).toEqual([
      { reason: 'PRECIO', label: 'Precio', count: 2 },
      { reason: 'COMPETENCIA', label: 'Competencia', count: 1 },
    ]);
  });

  it('lostAccounts: ≥1 lost-in-range, 0 won-in-range, 0 open now; ordered by lostAmount', async () => {
    const { svc } = makeService([
      // acc-lost: two losses, nothing else → listed, amounts summed, last reason = latest
      opp({
        id: 'l1',
        accountId: 'acc-lost',
        accountName: 'Perdida SA',
        stage: 'PERDIDA',
        closedAt: '2026-03-02T00:00:00Z',
        lostReason: 'PRECIO',
        estimatedValue: 100,
      }),
      opp({
        id: 'l2',
        accountId: 'acc-lost',
        accountName: 'Perdida SA',
        stage: 'PERDIDA',
        closedAt: '2026-03-20T00:00:00Z',
        lostReason: 'COMPETENCIA',
        estimatedValue: 400,
      }),
      // acc-mixed: lost but ALSO won in range → excluded
      opp({
        id: 'l3',
        accountId: 'acc-mixed',
        accountName: 'Mixta',
        stage: 'PERDIDA',
        closedAt: '2026-03-05T00:00:00Z',
        estimatedValue: 9000,
      }),
      opp({
        id: 'w1',
        accountId: 'acc-mixed',
        accountName: 'Mixta',
        stage: 'GANADA',
        closedAt: '2026-03-06T00:00:00Z',
        estimatedValue: 1,
      }),
      // acc-open: lost but has an OPEN opportunity now → excluded
      opp({
        id: 'l4',
        accountId: 'acc-open',
        accountName: 'Abierta',
        stage: 'PERDIDA',
        closedAt: '2026-03-07T00:00:00Z',
        estimatedValue: 8000,
      }),
      opp({ id: 'o1', accountId: 'acc-open', accountName: 'Abierta', stage: 'CONTACTO' }),
      // acc-small: one small loss → listed after acc-lost
      opp({
        id: 'l5',
        accountId: 'acc-small',
        accountName: 'Chica',
        stage: 'PERDIDA',
        closedAt: '2026-03-08T00:00:00Z',
        lostReason: 'OTRO',
        estimatedValue: 50,
      }),
    ]);
    const d = await svc.getDashboard('c1', RANGE);
    expect(d.lostAccounts.map((a) => a.accountId)).toEqual(['acc-lost', 'acc-small']);
    expect(d.lostAccounts[0]).toMatchObject({
      name: 'Perdida SA',
      lostAmount: 500,
      lastLostAt: '2026-03-20T00:00:00.000Z',
      lastReason: 'COMPETENCIA',
      lastReasonLabel: 'Competencia',
    });
  });

  it('topAccounts: top 5 by wonAmount in range', async () => {
    const { svc } = makeService([
      opp({
        id: 'w1',
        accountId: 'a',
        accountName: 'A',
        stage: 'GANADA',
        closedAt: '2026-03-02T00:00:00Z',
        estimatedValue: 100,
      }),
      opp({
        id: 'w2',
        accountId: 'b',
        accountName: 'B',
        stage: 'GANADA',
        closedAt: '2026-03-03T00:00:00Z',
        estimatedValue: 300,
      }),
      opp({
        id: 'w3',
        accountId: 'b',
        accountName: 'B',
        stage: 'GANADA',
        closedAt: '2026-03-04T00:00:00Z',
        estimatedValue: 50,
      }),
      opp({
        id: 'w-out',
        accountId: 'z',
        accountName: 'Z',
        stage: 'GANADA',
        closedAt: '2026-05-04T00:00:00Z',
        estimatedValue: 99999,
      }),
    ]);
    const d = await svc.getDashboard('c1', RANGE);
    expect(d.topAccounts).toEqual([
      { accountId: 'b', name: 'B', wonCount: 2, wonAmount: 350 },
      { accountId: 'a', name: 'A', wonCount: 1, wonAmount: 100 },
    ]);
  });

  it('activitiesByType from groupBy, in range, labelled', async () => {
    const { svc } = makeService(
      [],
      [
        { companyId: 'c1', type: 'LLAMADA', createdAt: '2026-03-02T00:00:00Z' },
        { companyId: 'c1', type: 'LLAMADA', createdAt: '2026-03-03T00:00:00Z' },
        { companyId: 'c1', type: 'REUNION', createdAt: '2026-03-03T00:00:00Z' },
        { companyId: 'c1', type: 'EMAIL', createdAt: '2026-04-03T00:00:00Z' },
        { companyId: 'OTHER', type: 'EMAIL', createdAt: '2026-03-03T00:00:00Z' },
      ],
    );
    const d = await svc.getDashboard('c1', RANGE);
    expect(d.activitiesByType).toEqual([
      { type: 'LLAMADA', label: 'Llamada', count: 2 },
      { type: 'REUNION', label: 'Reunión', count: 1 },
    ]);
  });
});

describe('DashboardService — tenant discipline', () => {
  it('EVERY query carries the explicit companyId, in ONE round (5 calls)', async () => {
    const { svc, calls } = makeService([opp({ id: 'o1' })]);
    await svc.getDashboard('c1', RANGE);
    expect(calls).toHaveLength(5);
    for (const c of calls) expect((c.where as Any).companyId).toBe('c1');
  });
});
