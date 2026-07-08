/* COM-005 — proves the stage-transition rules (the pipeline invariants) and the
 * cross-company account guard. COM-009 — proves each movement ALSO writes exactly one
 * system activity, in the SAME transaction, with the right subject text.
 *
 * The fake separates READS (this.prisma: findFirst / count) from WRITES (a distinct
 * `tx` object the fake executeWithRls passes). So the activity write can ONLY happen
 * on the tx (this.prisma has no write methods) and a single executeWithRls call proves
 * the activity is atomic with the stage mutation — not a separate transaction. */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { LostReason, OpportunityStage } from '@prisma/client';
import { OpportunitiesService } from './opportunities.service';

type Any = Record<string, unknown>;

function makeService(oppRow: Any | null, accountRow: Any | null = { id: 'acc1' }, quoteCount = 0) {
  const oppUpdate = jest.fn((args: Any) =>
    Promise.resolve({ id: 'o1', accountId: 'acc1', companyId: 'c1', ...(args.data as Any) }),
  );
  const oppCreate = jest.fn((args: Any) => Promise.resolve({ id: 'o1', ...(args.data as Any) }));
  const oppDelete = jest.fn(() => Promise.resolve({ id: 'o1' }));
  const activityCreate = jest.fn((args: Any) =>
    Promise.resolve({ id: 'act1', ...(args.data as Any) }),
  );
  // WRITES live on the tx only (mirrors a real Prisma transaction client).
  const tx = {
    opportunity: { update: oppUpdate, create: oppCreate, delete: oppDelete },
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
    await svc.changeStage('o1', 'c1', 'u1', { stage: S.CONTACTO });
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
    await svc.reopen('o1', 'c1', 'u1');
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
    await svc.changeStage('o1', 'c1', 'u1', { stage: S.PROSPECTO });
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
  });

  it('→GANADA writes "Oportunidad ganada"', async () => {
    const { svc, activityCreate } = makeService(opp(S.NEGOCIACION));
    await svc.changeStage('o1', 'c1', 'u1', { stage: S.GANADA });
    expect(sysActivity(activityCreate).subject).toBe('Oportunidad ganada');
  });

  it('→PERDIDA (PRECIO) writes "Oportunidad perdida — Precio"', async () => {
    const { svc, activityCreate } = makeService(opp(S.NEGOCIACION));
    await svc.changeStage('o1', 'c1', 'u1', { stage: S.PERDIDA, lostReason: LostReason.PRECIO });
    expect(sysActivity(activityCreate).subject).toBe('Oportunidad perdida — Precio');
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
  });

  it('→EN_PAUSA writes "Oportunidad en pausa"', async () => {
    const { svc, activityCreate } = makeService(opp(S.COTIZACION));
    await svc.changeStage('o1', 'c1', 'u1', { stage: S.EN_PAUSA });
    expect(sysActivity(activityCreate).subject).toBe('Oportunidad en pausa');
  });

  it('resume writes "Oportunidad reanudada (a {stage})"', async () => {
    const { svc, activityCreate } = makeService(opp(S.EN_PAUSA, { previousStage: S.COTIZACION }));
    await svc.resume('o1', 'c1', 'u1');
    expect(sysActivity(activityCreate).subject).toBe('Oportunidad reanudada (a Cotización)');
  });

  it('direct EN_PAUSA→active (resume-elsewhere) also reads as reanudada', async () => {
    const { svc, activityCreate } = makeService(opp(S.EN_PAUSA, { previousStage: S.COTIZACION }));
    await svc.changeStage('o1', 'c1', 'u1', { stage: S.PROSPECTO });
    expect(sysActivity(activityCreate).subject).toBe('Oportunidad reanudada (a Prospecto)');
  });

  it('reopen writes "Oportunidad reabierta"', async () => {
    const { svc, activityCreate } = makeService(opp(S.GANADA, { closedAt: new Date() }));
    await svc.reopen('o1', 'c1', 'u1');
    expect(sysActivity(activityCreate).subject).toBe('Oportunidad reabierta');
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
