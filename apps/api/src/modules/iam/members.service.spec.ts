import { Prisma } from '@prisma/client';
import { MembersService } from './members.service';

const rows = [
  {
    userId: 'blank',
    companyId: 'company-a',
    isActive: true,
    role: 'ADMIN',
    user: { firstName: ' ', lastName: ' ', email: 'legacy@example.test', isActive: true },
  },
  {
    userId: 'active',
    companyId: 'company-a',
    isActive: true,
    role: 'VIEWER',
    user: { firstName: 'Ana', lastName: 'Acuña', email: 'ana@example.test', isActive: false },
  },
  {
    userId: 'inactive',
    companyId: 'company-a',
    isActive: false,
    role: 'MANAGER',
    user: { firstName: 'Zoe', lastName: 'Díaz', email: 'zoe@example.test', isActive: true },
  },
  {
    userId: 'foreign',
    companyId: 'company-b',
    isActive: true,
    role: 'ADMIN',
    user: { firstName: 'Otra', lastName: 'Empresa', email: 'other@example.test', isActive: true },
  },
];

function setup() {
  let insideRls = false;
  const tx = {
    membership: {
      findMany: jest.fn(async ({ where }: { where: { companyId: string; isActive?: boolean } }) => {
        expect(insideRls).toBe(true);
        return rows.filter(
          (row) =>
            row.companyId === where.companyId &&
            (where.isActive === undefined || row.isActive === where.isActive),
        );
      }),
    },
  };
  const rls = {
    executeWithRls: jest.fn(
      async (
        _companyId: string,
        _userId: string,
        fn: (client: Prisma.TransactionClient) => Promise<unknown>,
      ) => {
        insideRls = true;
        try {
          return await fn(tx as never);
        } finally {
          insideRls = false;
        }
      },
    ),
  };
  return { service: new MembersService(rls as never), tx, rls };
}

describe('MEM-001 members directory', () => {
  it('returns exactly the signed keys, trims names and falls back to the email local-part', async () => {
    const { service } = setup();
    const result = await service.listForCompany('company-a', 'actor');
    expect(result).toEqual([
      { userId: 'blank', displayName: 'legacy' },
      { userId: 'active', displayName: 'Ana Acuña' },
      { userId: 'inactive', displayName: 'Zoe Díaz' },
    ]);
    for (const member of result)
      expect(Object.keys(member).sort()).toEqual(['displayName', 'userId']);
  });

  it('runs only through the transaction client with explicit company isolation and name ordering', async () => {
    const { service, tx, rls } = setup();
    await service.listForCompany('company-a', 'actor');
    expect(rls.executeWithRls).toHaveBeenCalledWith('company-a', 'actor', expect.any(Function));
    expect(tx.membership.findMany).toHaveBeenCalledWith({
      where: { companyId: 'company-a' },
      select: { userId: true, user: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
    });
  });

  it('includes inactive memberships in all (the default) and excludes other companies', async () => {
    const { service } = setup();
    const defaults = await service.listForCompany('company-a', 'actor');
    expect(await service.listForCompany('company-a', 'actor', 'all')).toEqual(defaults);
    expect(defaults.map((member) => member.userId)).toEqual(['blank', 'active', 'inactive']);
  });

  it('active filters membership state, not global User state', async () => {
    const { service, tx } = setup();
    const result = await service.listForCompany('company-a', 'actor', 'active');
    expect(result.map((member) => member.userId)).toEqual(['blank', 'active']);
    expect(tx.membership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 'company-a', isActive: true },
      }),
    );
  });

  it('returns an empty array for a company without members', async () => {
    const { service } = setup();
    await expect(service.listForCompany('empty', 'actor')).resolves.toEqual([]);
  });
});
