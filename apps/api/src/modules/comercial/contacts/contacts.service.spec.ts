/* COM-004 — proves the single-primary business rule (at most one isPrimary=true
 * contact per account, unset atomically when a new primary is set) and that a
 * cross-company account reference is rejected. Fake Prisma/RLS clients (same
 * style as accounts.service.spec.ts). */
import { BadRequestException } from '@nestjs/common';
import { ContactsService } from './contacts.service';

type Any = Record<string, unknown>;

function makeService(accountRow: Any | null) {
  const updateMany = jest.fn(() => Promise.resolve({ count: 1 }));
  const contactCreate = jest.fn((args: Any) =>
    Promise.resolve({ id: 'ct1', ...(args.data as Any) }),
  );
  const contactUpdate = jest.fn((args: Any) =>
    Promise.resolve({ id: 'ct1', ...(args.data as Any) }),
  );
  const prisma = {
    account: { findFirst: () => Promise.resolve(accountRow) },
    contact: {
      findFirst: () => Promise.resolve({ id: 'ct1', companyId: 'c1', accountId: 'acc1' }),
      updateMany,
      create: contactCreate,
      update: contactUpdate,
    },
  } as unknown as ConstructorParameters<typeof ContactsService>[0];
  const rls = {
    executeWithRls: (_c: string, _u: string, fn: (t: unknown) => unknown) => fn(prisma),
  } as unknown as ConstructorParameters<typeof ContactsService>[1];
  return { svc: new ContactsService(prisma, rls), updateMany, contactCreate, contactUpdate };
}

describe('ContactsService — single-primary rule + account validation', () => {
  it('create with isPrimary=true unsets any other primary of the SAME account, then creates', async () => {
    const { svc, updateMany, contactCreate } = makeService({ id: 'acc1' });
    await svc.create('c1', 'u1', {
      accountId: 'acc1',
      firstName: 'Ana',
      lastName: 'Soto',
      isPrimary: true,
    } as never);
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: { companyId: 'c1', accountId: 'acc1', isPrimary: true },
      data: { isPrimary: false },
    });
    expect(contactCreate).toHaveBeenCalledTimes(1);
  });

  it('create WITHOUT isPrimary does not unset anyone', async () => {
    const { svc, updateMany, contactCreate } = makeService({ id: 'acc1' });
    await svc.create('c1', 'u1', {
      accountId: 'acc1',
      firstName: 'Ana',
      lastName: 'Soto',
    } as never);
    expect(updateMany).not.toHaveBeenCalled();
    expect(contactCreate).toHaveBeenCalledTimes(1);
  });

  it('create with an accountId NOT in the company is rejected (cross-company)', async () => {
    const { svc, updateMany, contactCreate } = makeService(null); // account lookup → not found
    await expect(
      svc.create('c1', 'u1', {
        accountId: 'acc-other',
        firstName: 'Ana',
        lastName: 'Soto',
        isPrimary: true,
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(updateMany).not.toHaveBeenCalled(); // rejected before the RLS transaction
    expect(contactCreate).not.toHaveBeenCalled();
  });

  it('update isPrimary=true unsets OTHER primaries of the same account (excluding self)', async () => {
    const { svc, updateMany, contactUpdate } = makeService({ id: 'acc1' });
    await svc.update('ct1', 'c1', 'u1', { isPrimary: true } as never);
    expect(updateMany).toHaveBeenCalledWith({
      where: { companyId: 'c1', accountId: 'acc1', isPrimary: true, id: { not: 'ct1' } },
      data: { isPrimary: false },
    });
    expect(contactUpdate).toHaveBeenCalledTimes(1);
  });

  it('update isPrimary=false is always allowed and unsets no one', async () => {
    const { svc, updateMany, contactUpdate } = makeService({ id: 'acc1' });
    await svc.update('ct1', 'c1', 'u1', { isPrimary: false } as never);
    expect(updateMany).not.toHaveBeenCalled();
    expect(contactUpdate).toHaveBeenCalledTimes(1);
  });
});
