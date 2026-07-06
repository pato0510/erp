/* COM-008 — proves the activity rules: account required + same-company; a linked
 * opportunity must belong to the account (mismatch rejected); accountId DERIVED when
 * created from an opportunity; isSystemGenerated FORCED false on create; system rows
 * are immutable (update & delete rejected — a fake system row is seeded to prove the
 * guard that COM-009 will rely on); the account list includes opportunity-linked
 * activities while the opportunity list excludes the rest; DESC ordering pinned.
 * Stateful fake Prisma/RLS (same style as the opportunities/bundle specs). */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { ActivityType } from '@prisma/client';
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

  const prisma = { activity, account, opportunity } as unknown as ConstructorParameters<
    typeof ActivitiesService
  >[0];
  const rls = {
    executeWithRls: (_c: string, _u: string, fn: (t: unknown) => unknown) => fn(prisma),
  } as unknown as ConstructorParameters<typeof ActivitiesService>[1];

  return { svc: new ActivitiesService(prisma, rls), activities, activity };
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
