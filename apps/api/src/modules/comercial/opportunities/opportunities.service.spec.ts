/* COM-005/COM-023 — proves the stage-transition rules (the pipeline invariants) and the
 * cross-company account guard. COM-009 — proves each movement ALSO writes exactly one
 * system activity, in the SAME transaction, with the right subject text.
 *
 * The fake keeps WRITES on a distinct `tx` object passed by executeWithRls;
 * COM-023 mutation reads also use that transaction. So the activity write can ONLY happen
 * on the tx (this.prisma has no write methods) and a single executeWithRls call proves
 * the activity is atomic with the stage mutation — not a separate transaction. */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { LostReason, OpportunityStage, Prisma } from '@prisma/client';
import { OpportunitiesService } from './opportunities.service';

type Any = Record<string, unknown>;

function makeService(
  oppRow: Any | null,
  accountRow: Any | null = { id: 'acc1', status: 'ACTIVA' },
  quoteCount = 0,
) {
  const oppUpdate = jest.fn((args: Any) =>
    Promise.resolve({ id: 'o1', accountId: 'acc1', companyId: 'c1', ...(args.data as Any) }),
  );
  const oppCreate = jest.fn((args: Any) => Promise.resolve({ id: 'o1', ...(args.data as Any) }));
  const oppDelete = jest.fn(() => Promise.resolve({ id: 'o1' }));
  const activityCreate = jest.fn((args: Any) =>
    Promise.resolve({ id: 'act1', ...(args.data as Any) }),
  );
  // Mutation reads and WRITES live on the tx (mirrors a real Prisma transaction client).
  const tx = {
    opportunity: {
      findFirst: () => Promise.resolve(oppRow),
      update: oppUpdate,
      create: oppCreate,
      delete: oppDelete,
    },
    opportunityService: { count: () => Promise.resolve(0) },
    opportunityStageProbability: { findMany: () => Promise.resolve([]) },
    account: { findFirst: () => Promise.resolve(accountRow) },
    activity: { create: activityCreate },
  };
  // READS live on this.prisma only (findOne / assertAccountInCompany / bundle count).
  const prisma = {
    opportunity: { findFirst: () => Promise.resolve(oppRow) },
    account: { findFirst: () => Promise.resolve(accountRow) },
    opportunityService: { count: () => Promise.resolve(0) },
    quote: { count: () => Promise.resolve(quoteCount) }, // COM-010 — delete-blocks-on-quotes
  } as unknown as ConstructorParameters<typeof OpportunitiesService>[0];
  const executeWithRls = jest.fn((_c: string, _u: string, fn: (t: unknown) => unknown) => fn(tx));
  const rls = { executeWithRls } as unknown as ConstructorParameters<
    typeof OpportunitiesService
  >[1];
  // COM-013b — OpportunitiesService gained a DomainEventsService dep (handoff). These
  // tests never call sendToOperations, so a stub emit suffices.
  const domainEvents = {
    emit: jest.fn(() => Promise.resolve('evt')),
  } as unknown as ConstructorParameters<typeof OpportunitiesService>[2];
  return {
    svc: new OpportunitiesService(prisma, rls, domainEvents),
    oppUpdate,
    oppCreate,
    oppDelete,
    activityCreate,
    executeWithRls,
  };
}
const opp = (stage: OpportunityStage, extra: Any = {}) => ({
  id: 'o1',
  companyId: 'c1',
  accountId: 'acc1',
  stage,
  previousStage: null,
  estimatedValue: new Prisma.Decimal(100),
  expectedCloseDate: new Date('2026-10-01'),
  probability: null,
  ...extra,
});
const lastData = (fn: jest.Mock) => (fn.mock.calls[0][0] as Any).data as Any;
/** The `data` of the (single) system-activity write. */
const sysActivity = (fn: jest.Mock) => (fn.mock.calls[0][0] as Any).data as Any;

describe('OpportunitiesService — stage transition rules', () => {
  const S = OpportunityStage;

  it('Rule 1: free movement among active stages — forward-skip PROSPECTO→NEGOCIACION', async () => {
    const { svc, oppUpdate } = makeService(opp(S.PROSPECTO));
    await svc.changeStage('o1', 'c1', 'u1', { stage: S.NEGOCIACION });
    expect(lastData(oppUpdate).stage).toBe(S.NEGOCIACION);
  });

  it('Rule 1: free movement — backward NEGOCIACION→CONTACTO', async () => {
    const { svc, oppUpdate } = makeService(opp(S.NEGOCIACION));
    await svc.changeStage('o1', 'c1', 'u1', { stage: S.CONTACTO, reason: 'Revisar alcance' });
    expect(lastData(oppUpdate).stage).toBe(S.CONTACTO);
  });

  it('Rule 2: active→PERDIDA WITHOUT lostReason is rejected', async () => {
    const { svc, oppUpdate } = makeService(opp(S.COTIZACION));
    await expect(svc.changeStage('o1', 'c1', 'u1', { stage: S.PERDIDA })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(oppUpdate).not.toHaveBeenCalled();
  });

  it('Rule 2: PERDIDA with OTRO but no detail is rejected', async () => {
    const { svc, oppUpdate } = makeService(opp(S.COTIZACION));
    await expect(
      svc.changeStage('o1', 'c1', 'u1', { stage: S.PERDIDA, lostReason: LostReason.OTRO }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(oppUpdate).not.toHaveBeenCalled();
  });

  it('Rule 2: PERDIDA with PRECIO accepted (detail optional) — sets closedAt', async () => {
    const { svc, oppUpdate } = makeService(opp(S.NEGOCIACION));
    await svc.changeStage('o1', 'c1', 'u1', { stage: S.PERDIDA, lostReason: LostReason.PRECIO });
    const d = lastData(oppUpdate);
    expect(d.stage).toBe(S.PERDIDA);
    expect(d.lostReason).toBe(LostReason.PRECIO);
    expect(d.closedAt).toBeInstanceOf(Date);
  });

  it('Rule 2: active→GANADA sets closedAt', async () => {
    const { svc, oppUpdate } = makeService(opp(S.NEGOCIACION));
    await svc.changeStage('o1', 'c1', 'u1', { stage: S.GANADA });
    const d = lastData(oppUpdate);
    expect(d.stage).toBe(S.GANADA);
    expect(d.closedAt).toBeInstanceOf(Date);
  });

  it('Rule 3: ordinary stage-move OUT of GANADA is rejected', async () => {
    const { svc, oppUpdate } = makeService(opp(S.GANADA));
    await expect(
      svc.changeStage('o1', 'c1', 'u1', { stage: S.NEGOCIACION }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(oppUpdate).not.toHaveBeenCalled();
  });

  it('Rule 3: reopen from PERDIDA → NEGOCIACION, closedAt cleared, lostReason preserved', async () => {
    const { svc, oppUpdate } = makeService(
      opp(S.PERDIDA, {
        lostReason: LostReason.PRECIO,
        lostReasonDetail: 'muy caro',
        closedAt: new Date(),
      }),
    );
    await svc.reopen('o1', 'c1', 'u1', { reason: 'Retomar propuesta' });
    const d = lastData(oppUpdate);
    expect(d.stage).toBe(S.NEGOCIACION);
    expect(d.closedAt).toBeNull();
    expect('lostReason' in d).toBe(false); // preserved — NOT touched by reopen
    expect('lostReasonDetail' in d).toBe(false);
  });

  it('Rule 4: pause from an active stage stores previousStage', async () => {
    const { svc, oppUpdate } = makeService(opp(S.COTIZACION));
    await svc.changeStage('o1', 'c1', 'u1', { stage: S.EN_PAUSA });
    const d = lastData(oppUpdate);
    expect(d.stage).toBe(S.EN_PAUSA);
    expect(d.previousStage).toBe(S.COTIZACION);
  });

  it('Rule 4: pausing GANADA is rejected', async () => {
    const { svc, oppUpdate } = makeService(opp(S.GANADA));
    await expect(svc.changeStage('o1', 'c1', 'u1', { stage: S.EN_PAUSA })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(oppUpdate).not.toHaveBeenCalled();
  });

  it('Rule 4: resume returns to previousStage and clears it', async () => {
    const { svc, oppUpdate } = makeService(opp(S.EN_PAUSA, { previousStage: S.COTIZACION }));
    await svc.resume('o1', 'c1', 'u1');
    const d = lastData(oppUpdate);
    expect(d.stage).toBe(S.COTIZACION);
    expect(d.previousStage).toBeNull();
  });

  it('Rule 4: direct move from EN_PAUSA to a different active stage clears previousStage', async () => {
    const { svc, oppUpdate } = makeService(opp(S.EN_PAUSA, { previousStage: S.COTIZACION }));
    await svc.changeStage('o1', 'c1', 'u1', { stage: S.PROSPECTO, reason: 'Revisar alcance' });
    const d = lastData(oppUpdate);
    expect(d.stage).toBe(S.PROSPECTO);
    expect(d.previousStage).toBeNull();
  });

  it('non-canonical path: general update REJECTS a stage edit', async () => {
    const { svc, oppUpdate } = makeService(opp(S.PROSPECTO));
    await expect(svc.update('o1', 'c1', 'u1', { stage: S.GANADA } as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(oppUpdate).not.toHaveBeenCalled();
  });

  it('create with a cross-company account is rejected (no create)', async () => {
    const { svc, oppCreate } = makeService(null, null); // account lookup → not found
    await expect(
      svc.create('c1', 'u1', { accountId: 'acc-other', name: 'X' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(oppCreate).not.toHaveBeenCalled();
  });

  it('delete a CLOSED opportunity is rejected (historical record)', async () => {
    const { svc, oppDelete } = makeService(opp(S.GANADA));
    await expect(svc.remove('o1', 'c1', 'u1')).rejects.toBeInstanceOf(ConflictException);
    expect(oppDelete).not.toHaveBeenCalled();
  });

  it('delete a non-closed opportunity is allowed', async () => {
    const { svc, oppDelete } = makeService(opp(S.PROSPECTO));
    await svc.remove('o1', 'c1', 'u1');
    expect(oppDelete).toHaveBeenCalledTimes(1);
  });

  it('COM-010: delete a non-closed opportunity WITH quotes is rejected (409)', async () => {
    const { svc, oppDelete } = makeService(opp(S.PROSPECTO), { id: 'acc1' }, 1); // 1 quote exists
    await expect(svc.remove('o1', 'c1', 'u1')).rejects.toBeInstanceOf(ConflictException);
    expect(oppDelete).not.toHaveBeenCalled();
  });
});

describe('OpportunitiesService — COM-009 system-generated timeline entries', () => {
  const S = OpportunityStage;

  it('CREATE writes one "Oportunidad creada" system activity (right account/opportunity/user)', async () => {
    const { svc, activityCreate } = makeService(null); // create uses assertAccountInCompany
    await svc.create('c1', 'u1', { accountId: 'acc1', name: 'X' } as never);
    expect(activityCreate).toHaveBeenCalledTimes(1);
    const a = sysActivity(activityCreate);
    expect(a.subject).toBe('Oportunidad creada');
    expect(a.systemEvent).toBe('CREACION');
    expect(a.status).toBeNull();
    expect(a.statusChangedAt).toBeNull();
    expect(a.isSystemGenerated).toBe(true);
    expect(a.type).toBe('NOTA');
    expect(a.accountId).toBe('acc1');
    expect(a.opportunityId).toBe('o1');
    expect(a.createdBy).toBe('u1');
    expect(a.detail).toBeNull();
  });

  it('active→active writes "Etapa: {from} → {to}"', async () => {
    const { svc, activityCreate } = makeService(opp(S.PROSPECTO));
    await svc.changeStage('o1', 'c1', 'u1', { stage: S.NEGOCIACION });
    expect(sysActivity(activityCreate).subject).toBe('Etapa: Prospecto → Negociación');
    expect(sysActivity(activityCreate).systemEvent).toBe('CAMBIO_ETAPA');
  });

  it('→GANADA writes "Oportunidad ganada"', async () => {
    const { svc, activityCreate } = makeService(opp(S.NEGOCIACION));
    await svc.changeStage('o1', 'c1', 'u1', { stage: S.GANADA });
    expect(sysActivity(activityCreate).subject).toBe('Oportunidad ganada');
    expect(sysActivity(activityCreate).systemEvent).toBe('GANADA');
  });

  it('→PERDIDA (PRECIO) writes "Oportunidad perdida — Precio"', async () => {
    const { svc, activityCreate } = makeService(opp(S.NEGOCIACION));
    await svc.changeStage('o1', 'c1', 'u1', { stage: S.PERDIDA, lostReason: LostReason.PRECIO });
    expect(sysActivity(activityCreate).subject).toBe('Oportunidad perdida — Precio');
    expect(sysActivity(activityCreate).systemEvent).toBe('PERDIDA');
  });

  it('→PERDIDA (OTRO + detail) appends the detail — "Oportunidad perdida — Otro: {detail}"', async () => {
    const { svc, activityCreate } = makeService(opp(S.NEGOCIACION));
    await svc.changeStage('o1', 'c1', 'u1', {
      stage: S.PERDIDA,
      lostReason: LostReason.OTRO,
      lostReasonDetail: '  se fueron con la competencia interna  ',
    });
    expect(sysActivity(activityCreate).subject).toBe(
      'Oportunidad perdida — Otro: se fueron con la competencia interna',
    );
    expect(sysActivity(activityCreate).systemEvent).toBe('PERDIDA');
  });

  it('→EN_PAUSA writes "Oportunidad en pausa"', async () => {
    const { svc, activityCreate } = makeService(opp(S.COTIZACION));
    await svc.changeStage('o1', 'c1', 'u1', { stage: S.EN_PAUSA });
    expect(sysActivity(activityCreate).subject).toBe('Oportunidad en pausa');
    expect(sysActivity(activityCreate).systemEvent).toBe('PAUSA');
  });

  it('resume writes "Oportunidad reanudada (a {stage})"', async () => {
    const { svc, activityCreate } = makeService(opp(S.EN_PAUSA, { previousStage: S.COTIZACION }));
    await svc.resume('o1', 'c1', 'u1');
    expect(sysActivity(activityCreate).subject).toBe('Oportunidad reanudada (a Cotización)');
    expect(sysActivity(activityCreate).systemEvent).toBe('REANUDACION');
  });

  it('direct EN_PAUSA→active (resume-elsewhere) also reads as reanudada', async () => {
    const { svc, activityCreate } = makeService(opp(S.EN_PAUSA, { previousStage: S.COTIZACION }));
    await svc.changeStage('o1', 'c1', 'u1', { stage: S.PROSPECTO, reason: 'Revisar alcance' });
    expect(sysActivity(activityCreate).subject).toBe('Oportunidad reanudada (a Prospecto)');
    expect(sysActivity(activityCreate).systemEvent).toBe('REANUDACION');
  });

  it('reopen writes "Oportunidad reabierta"', async () => {
    const { svc, activityCreate } = makeService(opp(S.GANADA, { closedAt: new Date() }));
    await svc.reopen('o1', 'c1', 'u1', { reason: 'Retomar propuesta' });
    expect(sysActivity(activityCreate).subject).toBe('Oportunidad reabierta');
    expect(sysActivity(activityCreate).systemEvent).toBe('REAPERTURA');
  });

  it('a REJECTED transition (PERDIDA without reason) writes NO activity', async () => {
    const { svc, activityCreate } = makeService(opp(S.NEGOCIACION));
    await expect(svc.changeStage('o1', 'c1', 'u1', { stage: S.PERDIDA })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(activityCreate).not.toHaveBeenCalled();
  });

  it('a REJECTED transition (move OUT of GANADA) writes NO activity', async () => {
    const { svc, activityCreate } = makeService(opp(S.GANADA));
    await expect(
      svc.changeStage('o1', 'c1', 'u1', { stage: S.NEGOCIACION }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(activityCreate).not.toHaveBeenCalled();
  });

  it('ATOMICITY: the activity + the stage update share ONE transaction (single executeWithRls, both writes)', async () => {
    const { svc, oppUpdate, activityCreate, executeWithRls } = makeService(opp(S.PROSPECTO));
    await svc.changeStage('o1', 'c1', 'u1', { stage: S.CONTACTO });
    // one transaction, both writes went through the tx it passed (this.prisma has no
    // write methods, so the activity could not have used a separate client).
    expect(executeWithRls).toHaveBeenCalledTimes(1);
    expect(oppUpdate).toHaveBeenCalledTimes(1);
    expect(activityCreate).toHaveBeenCalledTimes(1);
  });

  it('exactly ONE system activity per movement (no duplicates)', async () => {
    const { svc, activityCreate } = makeService(opp(S.PROSPECTO));
    await svc.changeStage('o1', 'c1', 'u1', { stage: S.CONTACTO });
    expect(activityCreate).toHaveBeenCalledTimes(1);
  });
});

/* COM-020 — list filters + the DERIVED per-opportunity lastMovementAt. A separate stateful
 * fake (the COM-005 one above is fixed-shape): opportunity.findMany honours the where
 * shape the service builds, $queryRaw is mocked and asserted to run ONCE per list call
 * with the companyId and the page ids. Existing callers (no filters) keep every stage. */
describe('OpportunitiesService — COM-020 list filters + lastMovementAt', () => {
  type Row = Record<string, unknown>;
  const DAY = 24 * 60 * 60 * 1000;
  const rows: Row[] = [
    {
      id: 'p1',
      companyId: 'c1',
      stage: 'PROSPECTO',
      name: 'Faena Norte',
      ownerId: 'u1',
      account: { name: 'Minera', enterpriseId: 'e1' },
      closedAt: null,
    },
    {
      id: 'n1',
      companyId: 'c1',
      stage: 'NEGOCIACION',
      name: 'Planta',
      ownerId: 'u2',
      account: { name: 'Constructora', enterpriseId: null },
      closedAt: null,
    },
    {
      id: 'w-recent',
      companyId: 'c1',
      stage: 'GANADA',
      name: 'Ganada reciente',
      ownerId: 'u1',
      account: { name: 'Minera', enterpriseId: 'e1' },
      closedAt: new Date(Date.now() - 10 * DAY),
    },
    {
      id: 'l-old',
      companyId: 'c1',
      stage: 'PERDIDA',
      name: 'Perdida vieja',
      ownerId: 'u1',
      account: { name: 'Minera', enterpriseId: 'e1' },
      closedAt: new Date(Date.now() - 200 * DAY),
    },
    {
      id: 'other',
      companyId: 'OTHER',
      stage: 'PROSPECTO',
      name: 'Ajena',
      ownerId: 'u1',
      account: { name: 'X', enterpriseId: null },
      closedAt: null,
    },
  ];
  const matchStage = (r: Row, cond: unknown): boolean => {
    if (cond === undefined) return true;
    const c = cond as Row;
    if (c.in) return (c.in as string[]).includes(r.stage as string);
    if (c.notIn) return !(c.notIn as string[]).includes(r.stage as string);
    return r.stage === cond;
  };
  const matches = (r: Row, w: Row): boolean => {
    if (w.companyId !== undefined && r.companyId !== w.companyId) return false;
    if (!matchStage(r, w.stage)) return false;
    if (w.ownerId !== undefined && r.ownerId !== w.ownerId) return false;
    if (w.account !== undefined) {
      const a = w.account as Row;
      if ('enterpriseId' in a && (r.account as Row).enterpriseId !== a.enterpriseId) return false;
      if (
        a.name &&
        !String((r.account as Row).name)
          .toLowerCase()
          .includes(String((a.name as Row).contains).toLowerCase())
      )
        return false;
    }
    if (
      w.name &&
      !String(r.name)
        .toLowerCase()
        .includes(String((w.name as Row).contains).toLowerCase())
    )
      return false;
    if (
      w.closedAt &&
      (r.closedAt === null || (r.closedAt as Date) < ((w.closedAt as Row).gte as Date))
    )
      return false;
    if (w.OR && !(w.OR as Row[]).some((o) => matches(r, o))) return false;
    if (w.AND && !(w.AND as Row[]).every((o) => matches(r, o))) return false;
    return true;
  };
  function makeListService(lastMovement: Row[] = [], pending: Row[] = []) {
    const findMany = jest.fn((args: Row) =>
      Promise.resolve(
        rows
          .filter((r) => matches(r, args.where as Row))
          .map((r) => ({
            ...r,
            _count: { services: r.id === 'n1' ? 2 : 0 },
            createdAt: new Date('2026-09-01T12:00:00Z'),
          })),
      ),
    );
    const queryRaw = jest.fn(() => Promise.resolve(lastMovement));
    const activityFindMany = jest.fn(() => Promise.resolve(pending));
    const prisma = {
      opportunity: { findMany },
      $queryRaw: queryRaw,
      activity: { findMany: activityFindMany },
    } as unknown as ConstructorParameters<typeof OpportunitiesService>[0];
    const rls = {} as unknown as ConstructorParameters<typeof OpportunitiesService>[1];
    const domainEvents = {} as unknown as ConstructorParameters<typeof OpportunitiesService>[2];
    return {
      svc: new OpportunitiesService(prisma, rls, domainEvents),
      findMany,
      queryRaw,
      activityFindMany,
    };
  }
  const ids = (list: Row[]) => list.map((r) => r.id);

  it('no filters → legacy full set (every stage, closed included), enriched with account + lastMovementAt', async () => {
    const { svc, findMany } = makeListService();
    const list = (await svc.findAll('c1')) as Row[];
    expect(ids(list)).toEqual(['p1', 'n1', 'w-recent', 'l-old']);
    expect(list[0]).toHaveProperty('lastMovementAt', null);
    expect(list[0]).toHaveProperty('valueFromBundle', false);
    expect(list[1]).toHaveProperty('valueFromBundle', true);
    expect(list.every((row) => !('_count' in row))).toBe(true);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 'c1' },
        include: {
          _count: { select: { services: true } },
          account: {
            select: { id: true, name: true, enterprise: { select: { id: true, name: true } } },
          },
        },
      }),
    );
  });

  it('stage[] filters (repeatable)', async () => {
    const { svc } = makeListService();
    expect(
      ids((await svc.findAll('c1', { stage: ['PROSPECTO', 'NEGOCIACION'] as never })) as Row[]),
    ).toEqual(['p1', 'n1']);
  });

  it('q matches the opportunity name OR the account name, case-insensitive', async () => {
    const { svc } = makeListService();
    expect(ids((await svc.findAll('c1', { q: 'planta' })) as Row[])).toEqual(['n1']);
    expect(ids((await svc.findAll('c1', { q: 'MINERA' })) as Row[])).toEqual([
      'p1',
      'w-recent',
      'l-old',
    ]);
  });

  it('ownerId / enterpriseId / noEnterprise filters; both enterprise params → 400', async () => {
    const { svc } = makeListService();
    expect(ids((await svc.findAll('c1', { ownerId: 'u2' })) as Row[])).toEqual(['n1']);
    expect(ids((await svc.findAll('c1', { enterpriseId: 'e1' })) as Row[])).toEqual([
      'p1',
      'w-recent',
      'l-old',
    ]);
    expect(ids((await svc.findAll('c1', { noEnterprise: true })) as Row[])).toEqual(['n1']);
    await expect(
      svc.findAll('c1', { enterpriseId: 'e1', noEnterprise: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('includeClosed=false → open only; includeClosed=true → open + closed within 90 days', async () => {
    const { svc } = makeListService();
    expect(ids((await svc.findAll('c1', { includeClosed: false })) as Row[])).toEqual(['p1', 'n1']);
    expect(ids((await svc.findAll('c1', { includeClosed: true })) as Row[])).toEqual([
      'p1',
      'n1',
      'w-recent',
    ]);
  });

  it('lastMovementAt is merged from ONE raw query per list call, carrying the companyId and the ids', async () => {
    const when = new Date('2026-09-10T12:00:00Z');
    const { svc, queryRaw } = makeListService([{ id: 'n1', lastMovementAt: when }]);
    const list = (await svc.findAll('c1', { includeClosed: false })) as Row[];
    expect(list.find((r) => r.id === 'n1')?.lastMovementAt).toBe(when.toISOString());
    expect(list.find((r) => r.id === 'p1')?.lastMovementAt).toBeNull();
    expect(queryRaw).toHaveBeenCalledTimes(1);
    const sql = queryRaw.mock.calls[0][0] as unknown as { text: string; values: unknown[] };
    expect(sql.text).toContain('GREATEST(o."updatedAt", act.last, n.last, d.last)');
    expect(sql.text).toContain('o."companyId" = $1::uuid AND o.id = ANY($2::uuid[])');
    expect(sql.values).toEqual(['c1', ['p1', 'n1']]);
  });

  it('COM-022 list combines counts and latest update with one raw and one pending read', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-24T02:30:00Z'));
    try {
      const when = new Date('2026-09-23T20:00:00Z');
      const { svc, queryRaw, activityFindMany } = makeListService(
        [
          {
            id: 'n1',
            lastMovementAt: when,
            lastUpdateAt: when,
            lastUpdateKind: 'ACCION_COMPLETADA',
          },
        ],
        [
          { opportunityId: 'n1', activityDate: new Date('2026-09-23T15:00:00Z') },
          { opportunityId: 'n1', activityDate: new Date('2026-09-22T15:00:00Z') },
          { opportunityId: 'p1', activityDate: new Date('2026-09-25T15:00:00Z') },
        ],
      );
      const list = await svc.findAll('c1', { includeClosed: false });
      expect(list[1]).toMatchObject({
        pendingActions: 2,
        overdueActions: 1,
        lastUpdate: { at: when.toISOString(), kind: 'ACCION_COMPLETADA' },
      });
      expect(list[0]).toMatchObject({
        pendingActions: 1,
        overdueActions: 0,
        lastUpdate: { at: '2026-09-01T12:00:00.000Z', kind: 'CREACION' },
      });
      expect(queryRaw).toHaveBeenCalledTimes(1);
      expect(activityFindMany).toHaveBeenCalledTimes(1);
      expect(activityFindMany).toHaveBeenCalledWith({
        where: {
          companyId: 'c1',
          opportunityId: { in: ['p1', 'n1'] },
          status: 'PENDIENTE',
          isSystemGenerated: false,
        },
        select: { opportunityId: true, activityDate: true },
      });
      jest.setSystemTime(new Date('2026-09-24T03:30:00Z'));
      expect((await svc.findAll('c1', { includeClosed: false }))[1].overdueActions).toBe(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('COM-022 no activity has zero counts and the opportunity creation fallback', async () => {
    const { svc } = makeListService();
    for (const row of await svc.findAll('c1'))
      expect(row).toMatchObject({
        pendingActions: 0,
        overdueActions: 0,
        lastUpdate: { at: '2026-09-01T12:00:00.000Z', kind: 'CREACION' },
      });
  });

  it('ALERT-001 helper keeps its Map<string, Date> signature, filtering empty values and skipping empty ids', async () => {
    const when = new Date('2026-09-23T20:00:00Z');
    const { svc, queryRaw, activityFindMany } = makeListService([
      { id: 'n1', lastMovementAt: when },
      { id: 'p1', lastMovementAt: null },
    ]);
    expect(await svc.lastMovementByOpportunity('c1', [])).toEqual(new Map());
    expect(queryRaw).not.toHaveBeenCalled();
    expect(await svc.lastMovementByOpportunity('c1', ['p1', 'n1'])).toEqual(
      new Map([['n1', when]]),
    );
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(activityFindMany).not.toHaveBeenCalled();
  });

  it('an empty list skips the raw query', async () => {
    const { svc, queryRaw, activityFindMany } = makeListService();
    expect(await svc.findAll('c1', { ownerId: 'nobody' })).toEqual([]);
    expect(activityFindMany).not.toHaveBeenCalled();
    expect(queryRaw).not.toHaveBeenCalled();
  });
});

describe('OpportunitiesService — COM-022 real field edits', () => {
  const S = OpportunityStage;
  const cases = [
    {
      before: {},
      dto: { estimatedValue: 19266400, expectedCloseDate: '2026-09-23', probability: 40 },
      subjects: [
        'Valor estimado definido: $19.266.400',
        'Fecha de cierre definida: 23-09-2026',
        'Probabilidad definida: 40%',
      ],
    },
    {
      before: {
        estimatedValue: new Prisma.Decimal(19266400),
        expectedCloseDate: new Date('2026-09-23T00:00:00Z'),
        probability: 40,
      },
      dto: { estimatedValue: 20000000, expectedCloseDate: '2026-10-01', probability: 60 },
      subjects: [
        'Valor estimado: $19.266.400 → $20.000.000',
        'Fecha de cierre: 23-09-2026 → 01-10-2026',
        'Probabilidad: 40% → 60%',
      ],
    },
    {
      before: {
        estimatedValue: new Prisma.Decimal(19266400),
        expectedCloseDate: new Date('2026-09-23T00:00:00Z'),
        probability: 40,
      },
      dto: { estimatedValue: null, expectedCloseDate: null, probability: null },
      subjects: [
        'Valor estimado eliminado (era $19.266.400)',
        'Fecha de cierre eliminada (era 23-09-2026)',
        'Probabilidad eliminada (era 40%)',
      ],
    },
  ];
  it.each(cases)(
    'writes exact defined/changed/removed subjects: $subjects',
    async ({ before, dto, subjects }) => {
      const { svc, activityCreate, oppUpdate, executeWithRls } = makeService(
        opp(S.PROSPECTO, { estimatedValue: null, expectedCloseDate: null, ...before }),
      );
      await svc.update('o1', 'c1', 'u1', dto as never);
      expect(executeWithRls).toHaveBeenCalledTimes(1);
      expect(oppUpdate).toHaveBeenCalledTimes(1);
      expect(activityCreate).toHaveBeenCalledTimes(3);
      const events = ['VALOR_ESTIMADO', 'FECHA_CIERRE', 'PROBABILIDAD'];
      activityCreate.mock.calls.forEach(([arg], i) =>
        expect(arg.data).toMatchObject({
          subject: subjects[i],
          systemEvent: events[i],
          isSystemGenerated: true,
          status: null,
          statusChangedAt: null,
          type: 'NOTA',
          companyId: 'c1',
          accountId: 'acc1',
          opportunityId: 'o1',
          createdBy: 'u1',
        }),
      );
    },
  );

  it('Decimal equality, civil-day equality and unchanged probability write nothing', async () => {
    const { svc, activityCreate, executeWithRls } = makeService(
      opp(S.PROSPECTO, {
        estimatedValue: new Prisma.Decimal('19266400.00'),
        expectedCloseDate: new Date('2026-09-23T00:00:00Z'),
        probability: 40,
      }),
    );
    await svc.update('o1', 'c1', 'u1', {
      estimatedValue: 19266400,
      expectedCloseDate: '2026-09-23T15:00:00Z',
      probability: 40,
    });
    expect(activityCreate).not.toHaveBeenCalled();
    expect(executeWithRls).toHaveBeenCalledTimes(1);
  });

  it('clearing fields already null and editing name/notes/account write nothing', async () => {
    const { svc, activityCreate } = makeService(
      opp(S.PROSPECTO, { estimatedValue: null, expectedCloseDate: null }),
    );
    await svc.update('o1', 'c1', 'u1', {
      name: 'Renombrada',
      notes: 'Nota',
      accountId: 'acc1',
      estimatedValue: null,
      expectedCloseDate: null,
      probability: null,
    } as never);
    expect(activityCreate).not.toHaveBeenCalled();
  });

  it('logs only the changed field; zero is a defined value', async () => {
    const { svc, activityCreate } = makeService(
      opp(S.PROSPECTO, { probability: 40, estimatedValue: null, expectedCloseDate: null }),
    );
    await svc.update('o1', 'c1', 'u1', { estimatedValue: 0, probability: 40 });
    expect(activityCreate).toHaveBeenCalledTimes(1);
    expect(sysActivity(activityCreate)).toMatchObject({
      systemEvent: 'VALOR_ESTIMADO',
      subject: 'Valor estimado definido: $0',
    });
  });

  it('probability zero is defined, and Decimal changes below a formatted peso still count', async () => {
    const { svc, activityCreate } = makeService(
      opp(S.PROSPECTO, { estimatedValue: new Prisma.Decimal('1.01') }),
    );
    await svc.update('o1', 'c1', 'u1', { estimatedValue: 1.02, probability: 0 });
    expect(activityCreate).toHaveBeenCalledTimes(2);
    expect(activityCreate.mock.calls.map(([a]) => (a.data as Any).subject)).toEqual([
      'Valor estimado: $1 → $1',
      'Probabilidad definida: 0%',
    ]);
  });
});
