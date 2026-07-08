/* COM-013b — proves OpportunitiesService.sendToOperations: the critical-rule rejections,
 * the already-sent 409, and the success path (emit-first, then stamp handoffAt; the event
 * payload matches the accepted quote's snapshot + amounts; occurredAt is the STABLE
 * timestamp used for BOTH the event and handoffAt). Plus the handoff gate (update
 * OpportunitySubject) denies ACCOUNTANT/ANALYST/VIEWER. Stateful fakes. */
import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CaslAbilityFactory, OpportunitySubject } from '../../common/casl/casl-ability.factory';
import { OpportunitiesService } from './opportunities.service';

type Any = Record<string, unknown>;

interface Opts {
  opp?: Any;
  quote?: Any | null;
  account?: Any;
  emitReturns?: string | null;
}
const baseOpp = (extra: Any = {}): Any => ({
  id: 'o1',
  companyId: 'c1',
  stage: 'GANADA',
  ownerId: 'owner1',
  accountId: 'acc1',
  name: 'Servicio de aseo faena norte',
  notes: 'notas de la oportunidad',
  handoffAt: null,
  ...extra,
});
const baseQuote = (extra: Any = {}): Any => ({
  id: 'q1',
  netAmount: 20000,
  taxAmount: 3800,
  totalAmount: 23800,
  lines: [{ serviceName: 'Aseo mensual', quantity: 2, unitPrice: 10000, lineTotal: 20000 }],
  ...extra,
});

function makeService(opts: Opts = {}) {
  const oppRow = opts.opp ?? baseOpp();
  const oppUpdate = jest.fn((args: Any) => Promise.resolve({ ...oppRow, ...(args.data as Any) }));
  const emit = jest.fn(() =>
    Promise.resolve(opts.emitReturns === undefined ? 'evt-row-1' : opts.emitReturns),
  );
  const tx = { opportunity: { update: oppUpdate } };
  const prisma = {
    opportunity: { findFirst: () => Promise.resolve(oppRow) },
    quote: {
      findFirst: () => Promise.resolve(opts.quote === undefined ? baseQuote() : opts.quote),
    },
    account: {
      findFirst: () =>
        Promise.resolve(opts.account ?? { name: 'Minera Los Andes SpA', counterpartyId: null }),
    },
  } as unknown as ConstructorParameters<typeof OpportunitiesService>[0];
  const rls = {
    executeWithRls: (_c: string, _u: string, fn: (t: unknown) => unknown) => fn(tx),
  } as unknown as ConstructorParameters<typeof OpportunitiesService>[1];
  const domainEvents = { emit } as unknown as ConstructorParameters<typeof OpportunitiesService>[2];
  return { svc: new OpportunitiesService(prisma, rls, domainEvents), emit, oppUpdate };
}

describe('OpportunitiesService.sendToOperations — critical rule', () => {
  it('rejects when the opportunity is not GANADA (400)', async () => {
    const { svc, emit } = makeService({ opp: baseOpp({ stage: 'NEGOCIACION' }) });
    await expect(svc.sendToOperations('c1', 'u1', 'o1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(emit).not.toHaveBeenCalled();
  });

  it('rejects when there is no accepted quote (400)', async () => {
    const { svc, emit } = makeService({ quote: null });
    await expect(svc.sendToOperations('c1', 'u1', 'o1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(emit).not.toHaveBeenCalled();
  });

  it('rejects when the accepted quote has no lines / empty scope (400)', async () => {
    const { svc, emit } = makeService({ quote: baseQuote({ lines: [] }) });
    await expect(svc.sendToOperations('c1', 'u1', 'o1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(emit).not.toHaveBeenCalled();
  });

  it('rejects when there is no commercial owner (400)', async () => {
    const { svc, emit } = makeService({ opp: baseOpp({ ownerId: null }) });
    await expect(svc.sendToOperations('c1', 'u1', 'o1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(emit).not.toHaveBeenCalled();
  });

  it('rejects with 409 when already sent (handoffAt set) — no re-emit', async () => {
    const { svc, emit } = makeService({ opp: baseOpp({ handoffAt: new Date() }) });
    await expect(svc.sendToOperations('c1', 'u1', 'o1')).rejects.toBeInstanceOf(ConflictException);
    expect(emit).not.toHaveBeenCalled();
  });
});

describe('OpportunitiesService.sendToOperations — success', () => {
  it('emits the handoff event with the accepted quote snapshot + amounts, then stamps handoffAt', async () => {
    const { svc, emit, oppUpdate } = makeService({
      account: { name: 'Minera Los Andes SpA', counterpartyId: 'cp1' },
    });
    await svc.sendToOperations('c1', 'u1', 'o1');

    expect(emit).toHaveBeenCalledTimes(1);
    const payload = emit.mock.calls[0][0] as Any;
    expect(payload.type).toBe('comercial.opportunity-won');
    expect(payload.opportunityId).toBe('o1'); // aggregateId — raw UUID
    expect(payload.quoteId).toBe('q1');
    expect(payload.clientName).toBe('Minera Los Andes SpA');
    expect(payload.counterpartyId).toBe('cp1');
    expect(payload.title).toBe('Servicio de aseo faena norte');
    expect(payload.scopeLines).toEqual([
      { serviceName: 'Aseo mensual', quantity: 2, unitPrice: 10000, lineTotal: 20000 },
    ]);
    expect(payload.netAmount).toBe(20000);
    expect(payload.taxAmount).toBe(3800);
    expect(payload.totalAmount).toBe(23800);
    expect(payload.currency).toBe('CLP');
    expect(payload.ownerId).toBe('owner1');

    // handoffAt stamped, and it equals the event's occurredAt (STABLE timestamp).
    expect(oppUpdate).toHaveBeenCalledTimes(1);
    const stamped = (oppUpdate.mock.calls[0][0] as Any).data as Any;
    expect(stamped.handoffAt).toBeInstanceOf(Date);
    expect(new Date(payload.occurredAt as string).getTime()).toBe(
      (stamped.handoffAt as Date).getTime(),
    );
  });

  it('does NOT stamp handoffAt if emit fails (returns null) → 500, opportunity stays resendable', async () => {
    const { svc, oppUpdate } = makeService({ emitReturns: null });
    await expect(svc.sendToOperations('c1', 'u1', 'o1')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    expect(oppUpdate).not.toHaveBeenCalled(); // handoffAt NOT set — "handoffAt set ⇒ event emitted"
  });
});

describe('COM-013b handoff gate — update OpportunitySubject', () => {
  const factory = new CaslAbilityFactory();
  const canUpdate = (role: UserRole) =>
    factory.defineAbilityFor(role).can('update', OpportunitySubject);

  it('writers (SUPER_ADMIN/ADMIN/MANAGER) may trigger the handoff; ACCOUNTANT/ANALYST/VIEWER cannot', () => {
    expect(canUpdate(UserRole.SUPER_ADMIN)).toBe(true);
    expect(canUpdate(UserRole.ADMIN)).toBe(true);
    expect(canUpdate(UserRole.MANAGER)).toBe(true);
    expect(canUpdate(UserRole.ACCOUNTANT)).toBe(false);
    expect(canUpdate(UserRole.ANALYST)).toBe(false);
    expect(canUpdate(UserRole.VIEWER)).toBe(false);
  });
});
