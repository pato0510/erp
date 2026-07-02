/* COM-005 — proves the stage-transition rules (the pipeline invariants) and the
 * cross-company account guard. Fake Prisma/RLS clients (same style as the accounts/
 * contacts specs); assertions inspect the `data` passed to opportunity.update. */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { LostReason, OpportunityStage } from '@prisma/client';
import { OpportunitiesService } from './opportunities.service';

type Any = Record<string, unknown>;

function makeService(oppRow: Any | null, accountRow: Any | null = { id: 'acc1' }) {
  const oppUpdate = jest.fn((args: Any) => Promise.resolve({ id: 'o1', ...(args.data as Any) }));
  const oppCreate = jest.fn((args: Any) => Promise.resolve({ id: 'o1', ...(args.data as Any) }));
  const oppDelete = jest.fn(() => Promise.resolve({ id: 'o1' }));
  const prisma = {
    opportunity: {
      findFirst: () => Promise.resolve(oppRow),
      update: oppUpdate,
      create: oppCreate,
      delete: oppDelete,
    },
    account: { findFirst: () => Promise.resolve(accountRow) },
  } as unknown as ConstructorParameters<typeof OpportunitiesService>[0];
  const rls = {
    executeWithRls: (_c: string, _u: string, fn: (t: unknown) => unknown) => fn(prisma),
  } as unknown as ConstructorParameters<typeof OpportunitiesService>[1];
  return { svc: new OpportunitiesService(prisma, rls), oppUpdate, oppCreate, oppDelete };
}
const opp = (stage: OpportunityStage, extra: Any = {}) => ({
  id: 'o1',
  companyId: 'c1',
  stage,
  previousStage: null,
  ...extra,
});
const lastData = (fn: jest.Mock) => (fn.mock.calls[0][0] as Any).data as Any;

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
});
