/* COM-008 — proves the activity rules: account required + same-company; a linked
 * opportunity must belong to the account (mismatch rejected); accountId DERIVED when
 * created from an opportunity; isSystemGenerated FORCED false on create; system rows
 * are immutable (update & delete rejected — a fake system row is seeded to prove the
 * guard that COM-009 will rely on); the account list includes opportunity-linked
 * activities while the opportunity list excludes the rest; DESC ordering pinned.
 * Stateful fake Prisma/RLS (same style as the opportunities/bundle specs). */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { ActivityType, CommercialActivityStatus } from '@prisma/client';
import { ActivitiesService } from './activities.service';

type Any = Record<string, unknown>;

interface Seed {
  accounts?: Record<string, string>; // id -> companyId (default acc1,acc2 in c1)
  opps?: Record<string, { accountId: string; companyId?: string }>; // default o1@acc1, o2@acc2
  activities?: Any[];
}

function makeService(seed: Seed = {}) {
  const accounts: Record<string, string> = seed.accounts ?? { acc1: 'c1', acc2: 'c1' };
  const opps: Record<string, { accountId: string; companyId: string }> = {};
  for (const [id, o] of Object.entries(
    seed.opps ?? { o1: { accountId: 'acc1' }, o2: { accountId: 'acc2' } },
  )) {
    opps[id] = { accountId: o.accountId, companyId: o.companyId ?? 'c1' };
  }
  const activities: Any[] = seed.activities ? [...seed.activities] : [];
  let seq = 1;

  const activity = {
    findFirst: jest.fn((args: Any) => {
      const w = args.where as Any;
      const found = activities.find((a) => a.id === w.id && a.companyId === w.companyId);
      return Promise.resolve(found ?? null);
    }),
    findMany: jest.fn((args: Any) => {
      const w = (args.where as Any) ?? {};
      let rows = activities.filter(
        (a) =>
          (w.companyId === undefined || a.companyId === w.companyId) &&
          (w.accountId === undefined || a.accountId === w.accountId) &&
          (w.opportunityId === undefined || a.opportunityId === w.opportunityId),
      );
      // orderBy activityDate DESC (the only ordering the service uses)
      rows = rows
        .slice()
        .sort(
          (x, y) =>
            new Date(y.activityDate as string).getTime() -
            new Date(x.activityDate as string).getTime(),
        );
      if (typeof args.take === 'number') rows = rows.slice(0, args.take);
      return Promise.resolve(rows);
    }),
    create: jest.fn((args: Any) => {
      const row = { id: `a${seq++}`, ...(args.data as Any) };
      activities.push(row);
      return Promise.resolve(row);
    }),
    update: jest.fn((args: Any) => {
      const row = activities.find((a) => a.id === (args.where as Any).id) as Any;
      Object.assign(row, args.data);
      return Promise.resolve(row);
    }),
    delete: jest.fn((args: Any) => {
      const idx = activities.findIndex((a) => a.id === (args.where as Any).id);
      const [row] = activities.splice(idx, 1);
      return Promise.resolve(row);
    }),
  };
  const account = {
    findFirst: jest.fn((args: Any) => {
      const w = args.where as Any;
      return Promise.resolve(accounts[w.id as string] === w.companyId ? { id: w.id } : null);
    }),
  };
  const opportunity = {
    findFirst: jest.fn((args: Any) => {
      const w = args.where as Any;
      const o = opps[w.id as string];
      return Promise.resolve(
        o && o.companyId === w.companyId ? { id: w.id, accountId: o.accountId } : null,
      );
    }),
  };

  const tx = {
    activity: { create: activity.create, update: activity.update, delete: activity.delete },
  };
  const prisma = {
    activity: { findFirst: activity.findFirst, findMany: activity.findMany },
    account,
    opportunity,
  } as unknown as ConstructorParameters<typeof ActivitiesService>[0];
  const executeWithRls = jest.fn((_c: string, _u: string, fn: (t: unknown) => unknown) => fn(tx));
  const rls = { executeWithRls } as unknown as ConstructorParameters<typeof ActivitiesService>[1];

  return { svc: new ActivitiesService(prisma, rls), activities, activity, executeWithRls };
}

const baseCreate = { type: ActivityType.LLAMADA, subject: 'Llamada de seguimiento' };

describe('ActivitiesService — create validation', () => {
  it('rejects when neither account nor opportunity is given', async () => {
    const { svc } = makeService();
    await expect(svc.create('c1', 'u1', { ...baseCreate } as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a cross-company / missing account', async () => {
    const { svc } = makeService({ accounts: { accX: 'OTHER' } });
    await expect(
      svc.create('c1', 'u1', { ...baseCreate, accountId: 'accX' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when the opportunity does not belong to the given account (mismatch)', async () => {
    const { svc } = makeService(); // o2 belongs to acc2
    await expect(
      svc.create('c1', 'u1', { ...baseCreate, accountId: 'acc1', opportunityId: 'o2' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('DERIVES accountId from the opportunity when created from a deal (no accountId asked)', async () => {
    const { svc } = makeService(); // o1 belongs to acc1
    const row = (await svc.create('c1', 'u1', {
      ...baseCreate,
      opportunityId: 'o1',
    } as never)) as Any;
    expect(row.accountId).toBe('acc1');
    expect(row.opportunityId).toBe('o1');
  });

  it('accepts an account+opportunity pair that matches', async () => {
    const { svc } = makeService();
    const row = (await svc.create('c1', 'u1', {
      ...baseCreate,
      accountId: 'acc1',
      opportunityId: 'o1',
    } as never)) as Any;
    expect(row.accountId).toBe('acc1');
  });

  it('FORCES isSystemGenerated false even if input tries to set it true', async () => {
    const { svc } = makeService();
    const row = (await svc.create('c1', 'u1', {
      ...baseCreate,
      accountId: 'acc1',
      isSystemGenerated: true,
    } as never)) as Any;
    expect(row.isSystemGenerated).toBe(false);
  });

  it('defaults activityDate to now when omitted', async () => {
    const { svc } = makeService();
    const row = (await svc.create('c1', 'u1', {
      ...baseCreate,
      accountId: 'acc1',
    } as never)) as Any;
    expect(row.activityDate).toBeInstanceOf(Date);
  });
});

describe('ActivitiesService — system-generated immutability (COM-009 guard, live now)', () => {
  const sys = {
    id: 'sys1',
    companyId: 'c1',
    accountId: 'acc1',
    opportunityId: null,
    isSystemGenerated: true,
  };

  it('REJECTS update of a system-generated activity', async () => {
    const { svc, activity } = makeService({ activities: [{ ...sys }] });
    await expect(
      svc.update('c1', 'u1', 'sys1', { subject: 'hack' } as never),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(activity.update).not.toHaveBeenCalled();
  });

  it('REJECTS delete of a system-generated activity', async () => {
    const { svc, activity } = makeService({ activities: [{ ...sys }] });
    await expect(svc.remove('c1', 'u1', 'sys1')).rejects.toBeInstanceOf(ConflictException);
    expect(activity.delete).not.toHaveBeenCalled();
  });

  it('ALLOWS update of a manual activity', async () => {
    const manual = {
      id: 'm1',
      companyId: 'c1',
      accountId: 'acc1',
      opportunityId: null,
      isSystemGenerated: false,
    };
    const { svc } = makeService({ activities: [{ ...manual }] });
    const row = (await svc.update('c1', 'u1', 'm1', { subject: 'editado' } as never)) as Any;
    expect(row.subject).toBe('editado');
  });
});

describe('ActivitiesService — update opportunity revalidation', () => {
  const manual = {
    id: 'm1',
    companyId: 'c1',
    accountId: 'acc1',
    opportunityId: null,
    isSystemGenerated: false,
  };

  it('rejects relinking to an opportunity of a DIFFERENT account', async () => {
    const { svc } = makeService({ activities: [{ ...manual }] }); // o2 belongs acc2
    await expect(
      svc.update('c1', 'u1', 'm1', { opportunityId: 'o2' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('unlinks when opportunityId is null', async () => {
    const linked = { ...manual, opportunityId: 'o1' };
    const { svc } = makeService({ activities: [{ ...linked }] });
    const row = (await svc.update('c1', 'u1', 'm1', { opportunityId: null } as never)) as Any;
    expect(row.opportunityId).toBeNull();
  });
});

describe('ActivitiesService — list scoping & ordering', () => {
  // acc1 has two activities (one linked to o1), acc2 has one. Dates out of order to
  // prove the DESC sort.
  const rows: Any[] = [
    {
      id: 'a-old',
      companyId: 'c1',
      accountId: 'acc1',
      opportunityId: null,
      activityDate: '2026-01-01T10:00:00Z',
    },
    {
      id: 'a-new',
      companyId: 'c1',
      accountId: 'acc1',
      opportunityId: 'o1',
      activityDate: '2026-03-01T10:00:00Z',
    },
    {
      id: 'a-mid',
      companyId: 'c1',
      accountId: 'acc1',
      opportunityId: null,
      activityDate: '2026-02-01T10:00:00Z',
    },
    {
      id: 'a-other',
      companyId: 'c1',
      accountId: 'acc2',
      opportunityId: null,
      activityDate: '2026-04-01T10:00:00Z',
    },
  ];

  it('account list INCLUDES opportunity-linked activities, excludes other accounts, DESC', async () => {
    const { svc } = makeService({ activities: rows });
    const list = (await svc.findAllByAccount('c1', 'acc1')) as Any[];
    expect(list.map((a) => a.id)).toEqual(['a-new', 'a-mid', 'a-old']); // o1-linked included, DESC
    expect(list.some((a) => a.accountId === 'acc2')).toBe(false);
  });

  it('opportunity list returns ONLY that opportunity’s activities', async () => {
    const { svc } = makeService({ activities: rows });
    const list = (await svc.findAllByOpportunity('c1', 'o1')) as Any[];
    expect(list.map((a) => a.id)).toEqual(['a-new']);
  });
});

describe('ActivitiesService — COM-022 actions', () => {
  const manual = {
    id: 'm1',
    companyId: 'c1',
    accountId: 'acc1',
    opportunityId: 'o1',
    type: ActivityType.EMAIL,
    subject: 'Enviar propuesta',
    isSystemGenerated: false,
    status: CommercialActivityStatus.PENDIENTE,
    statusChangedAt: null,
    activityDate: new Date('2026-09-23T15:00:00.000Z'),
  };
  afterEach(() => jest.useRealTimers());

  it.each([undefined, CommercialActivityStatus.PENDIENTE])(
    'create status %s; no transition at creation',
    async (status) => {
      const { svc, activity } = makeService();
      const row = await svc.create('c1', 'u1', { ...baseCreate, accountId: 'acc1', status });
      expect(row).toMatchObject({
        status: status ?? 'HECHA',
        statusChangedAt: null,
        systemEvent: null,
      });
      expect(activity.create).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['2026-09-23', '2026-06-23', '2028-02-29'])(
    'date-only %s uses 15:00Z on create AND update',
    async (day) => {
      const { svc } = makeService();
      const row = await svc.create('c1', 'u1', {
        ...baseCreate,
        accountId: 'acc1',
        activityDate: day,
      });
      expect(row.activityDate.toISOString()).toBe(`${day}T15:00:00.000Z`);
      const updated = await svc.update('c1', 'u1', row.id, { activityDate: day });
      expect(updated.activityDate.toISOString()).toBe(`${day}T15:00:00.000Z`);
    },
  );

  it.each(['2026-02-30', '2026-02-29', '2026-04-31', '2026-13-01'])(
    'impossible civil date %s rejects both writes with Spanish 400',
    async (activityDate) => {
      const { svc, activity } = makeService({ activities: [{ ...manual }] });
      const error = { status: 400, message: 'Fecha de acción inválida; indica una fecha real.' };
      await expect(
        svc.create('c1', 'u1', { ...baseCreate, accountId: 'acc1', activityDate }),
      ).rejects.toMatchObject(error);
      await expect(svc.update('c1', 'u1', 'm1', { activityDate })).rejects.toMatchObject(error);
      expect(activity.create).not.toHaveBeenCalled();
      expect(activity.update).not.toHaveBeenCalled();
    },
  );

  it.each(['2026-09-23T23:30:00-03:00', '2026-09-23T12:30'])(
    'preserves the legacy instant %s',
    async (activityDate) => {
      const { svc } = makeService();
      const row = await svc.create('c1', 'u1', { ...baseCreate, accountId: 'acc1', activityDate });
      expect(row.activityDate).toEqual(new Date(activityDate));
      expect((await svc.update('c1', 'u1', row.id, { activityDate })).activityDate).toEqual(
        new Date(activityDate),
      );
    },
  );

  it('status completes and reopens, replacing the last transition timestamp inside RLS', async () => {
    const { svc, executeWithRls, activity } = makeService({ activities: [{ ...manual }] });
    jest.useFakeTimers().setSystemTime(new Date('2026-09-24T03:30:00Z'));
    const done = await svc.updateStatus('c1', 'u1', 'm1', { status: 'HECHA' });
    expect(done).toMatchObject({ status: 'HECHA', statusChangedAt: new Date(), overdue: false });
    jest.setSystemTime(new Date('2026-09-24T04:30:00Z'));
    const reopened = await svc.updateStatus('c1', 'u1', 'm1', { status: 'PENDIENTE' });
    expect(reopened).toMatchObject({
      status: 'PENDIENTE',
      statusChangedAt: new Date(),
      overdue: true,
    });
    expect(executeWithRls).toHaveBeenCalledTimes(2);
    expect(activity.update).toHaveBeenCalledTimes(2);
    expect(activity.create).not.toHaveBeenCalled();
  });

  it('same status returns overdue without any write or timestamp change', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-24T03:30:00Z'));
    const { svc, executeWithRls, activity } = makeService({ activities: [{ ...manual }] });
    expect(await svc.updateStatus('c1', 'u1', 'm1', { status: 'PENDIENTE' })).toMatchObject({
      statusChangedAt: null,
      overdue: true,
    });
    expect(executeWithRls).not.toHaveBeenCalled();
    expect(activity.update).not.toHaveBeenCalled();
  });

  it('system row rejects status with the existing 409 message', async () => {
    const { svc, activity } = makeService({
      activities: [{ ...manual, isSystemGenerated: true, status: null }],
    });
    await expect(svc.updateStatus('c1', 'u1', 'm1', { status: 'HECHA' })).rejects.toMatchObject({
      status: 409,
      message:
        'Las acciones generadas por el sistema son un registro histórico: no pueden editarse ni eliminarse.',
    });
    expect(activity.update).not.toHaveBeenCalled();
  });

  it.each(['PENDIENTE', 'HECHA'] as const)(
    'delete linked %s action records the Santiago day + label + state in ONE tx',
    async (status) => {
      const { svc, activity, executeWithRls } = makeService({
        activities: [
          {
            ...manual,
            status,
            activityDate: new Date('2026-09-24T02:30:00Z'),
            subject: 'X'.repeat(200),
          },
        ],
      });
      await svc.remove('c1', 'u1', 'm1');
      expect(activity.delete).toHaveBeenCalledTimes(1);
      expect(activity.create).toHaveBeenCalledTimes(1);
      expect(executeWithRls).toHaveBeenCalledTimes(1);
      expect(executeWithRls).toHaveBeenCalledWith('c1', 'u1', expect.any(Function));
      const data = activity.create.mock.calls[0][0].data as Any;
      expect(data).toMatchObject({
        companyId: 'c1',
        accountId: 'acc1',
        opportunityId: 'o1',
        createdBy: 'u1',
        systemEvent: 'ACCION_ELIMINADA',
        isSystemGenerated: true,
        type: 'NOTA',
        status: null,
        statusChangedAt: null,
        subject: `Acción eliminada: ${'X'.repeat(181)}…`,
        detail: `Correo · 23-09-2026 · ${status === 'HECHA' ? 'Hecha' : 'Pendiente'}`,
      });
      expect((data.subject as string).length).toBe(200);
      expect(activity.delete.mock.invocationCallOrder[0]).toBeLessThan(
        activity.create.mock.invocationCallOrder[0],
      );
    },
  );

  it('delete keeps a short subject intact and uses the shared Visita técnica label', async () => {
    const { svc, activity } = makeService({ activities: [{ ...manual, type: 'VISITA_FAENA' }] });
    await svc.remove('c1', 'u1', 'm1');
    expect(activity.create.mock.calls[0][0].data).toMatchObject({
      subject: 'Acción eliminada: Enviar propuesta',
      detail: 'Visita técnica · 23-09-2026 · Pendiente',
    });
  });

  it('account-level delete writes no system action', async () => {
    const { svc, activity, executeWithRls } = makeService({
      activities: [{ ...manual, opportunityId: null }],
    });
    await svc.remove('c1', 'u1', 'm1');
    expect(activity.delete).toHaveBeenCalledTimes(1);
    expect(activity.create).not.toHaveBeenCalled();
    expect(executeWithRls).toHaveBeenCalledTimes(1);
  });

  it.each(['account', 'opportunity'])(
    '%s list derives overdue across Santiago midnight with no writes',
    async (scope) => {
      const { svc, activity } = makeService({
        activities: [
          { ...manual },
          { ...manual, id: 'done', status: 'HECHA' },
          { ...manual, id: 'system', status: null, isSystemGenerated: true },
        ],
      });
      const list = () =>
        scope === 'account'
          ? svc.findAllByAccount('c1', 'acc1')
          : svc.findAllByOpportunity('c1', 'o1');
      jest.useFakeTimers().setSystemTime(new Date('2026-09-24T02:30:00Z'));
      expect((await list()).map((a) => a.overdue)).toEqual([false, false, false]);
      jest.setSystemTime(new Date('2026-09-24T03:30:00Z'));
      expect((await list()).map((a) => a.overdue)).toEqual([true, false, false]);
      expect(activity.update).not.toHaveBeenCalled();
    },
  );
});

describe('COM-023-A user-facing action vocabulary', () => {
  it('account mismatch says acción', async () => {
    const { svc } = makeService({
      activities: [{ id: 'm1', companyId: 'c1', accountId: 'acc1', isSystemGenerated: false }],
    });
    await expect(svc.update('c1', 'u1', 'm1', { opportunityId: 'o2' })).rejects.toThrow(
      'La oportunidad no pertenece a la cuenta de esta acción.',
    );
  });
  it('immutable system rows say acciones', async () => {
    const { svc } = makeService({
      activities: [{ id: 's1', companyId: 'c1', accountId: 'acc1', isSystemGenerated: true }],
    });
    await expect(svc.update('c1', 'u1', 's1', { subject: 'Cambio' })).rejects.toThrow(
      'Las acciones generadas por el sistema son un registro histórico: no pueden editarse ni eliminarse.',
    );
  });
  it('missing action says Acción no encontrada', async () => {
    const { svc } = makeService();
    await expect(svc.update('c1', 'u1', 'missing', { subject: 'Cambio' })).rejects.toThrow(
      'Acción no encontrada',
    );
  });
  it('invalid civil date says acción', async () => {
    const { svc } = makeService();
    await expect(
      svc.create('c1', 'u1', { ...baseCreate, accountId: 'acc1', activityDate: '2026-02-30' }),
    ).rejects.toThrow('Fecha de acción inválida; indica una fecha real.');
  });
});
