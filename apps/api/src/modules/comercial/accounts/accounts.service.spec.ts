/* COM-003 — proves account↔counterparty stays DECOUPLED: creating or linking an
 * account NEVER creates a counterparty, and a link to a counterparty outside the
 * company (or nonexistent) is rejected via the company-scoped lookup. Fake
 * Prisma/RLS clients (same style as employees.security.spec.ts). */
import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';

type Any = Record<string, unknown>;

function makeService(counterpartyRow: Any | null) {
  const counterpartyCreate = jest.fn();
  const accountCreate = jest.fn((args: Any) =>
    Promise.resolve({ id: 'a1', ...(args.data as Any) }),
  );
  const accountUpdate = jest.fn((args: Any) =>
    Promise.resolve({ id: 'a1', ...(args.data as Any) }),
  );
  const prisma = {
    counterparty: {
      findFirst: () => Promise.resolve(counterpartyRow),
      create: counterpartyCreate,
    },
    account: {
      findFirst: () => Promise.resolve({ id: 'a1', companyId: 'c1' }),
      create: accountCreate,
      update: accountUpdate,
    },
  } as unknown as ConstructorParameters<typeof AccountsService>[0];
  const rls = {
    executeWithRls: (_c: string, _u: string, fn: (t: unknown) => unknown) => fn(prisma),
  } as unknown as ConstructorParameters<typeof AccountsService>[1];
  return {
    svc: new AccountsService(prisma, rls),
    counterpartyCreate,
    accountCreate,
    accountUpdate,
  };
}

describe('AccountsService — counterparty decoupling', () => {
  it('create with a counterpartyId NOT in the company is rejected (cross-company link)', async () => {
    const { svc, counterpartyCreate, accountCreate } = makeService(null); // lookup → not found
    await expect(
      svc.create('c1', 'u1', { name: 'X', counterpartyId: 'cp-other' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(counterpartyCreate).not.toHaveBeenCalled();
    expect(accountCreate).not.toHaveBeenCalled();
  });

  it('create WITHOUT a counterparty never creates a counterparty row', async () => {
    const { svc, counterpartyCreate, accountCreate } = makeService(null);
    await svc.create('c1', 'u1', { name: 'Nueva Cuenta' } as never);
    expect(counterpartyCreate).not.toHaveBeenCalled();
    expect(accountCreate).toHaveBeenCalledTimes(1);
  });

  it('create WITH a valid same-company counterparty links it — and still never creates one', async () => {
    const { svc, counterpartyCreate, accountCreate } = makeService({ id: 'cp1' });
    await svc.create('c1', 'u1', { name: 'X', counterpartyId: 'cp1' } as never);
    expect(counterpartyCreate).not.toHaveBeenCalled();
    expect(accountCreate).toHaveBeenCalledTimes(1);
  });

  it('update linking a cross-company counterparty is rejected (no write, no counterparty created)', async () => {
    const { svc, counterpartyCreate, accountUpdate } = makeService(null);
    await expect(
      svc.update('a1', 'c1', 'u1', { counterpartyId: 'cp-other' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(counterpartyCreate).not.toHaveBeenCalled();
    expect(accountUpdate).not.toHaveBeenCalled();
  });
});

describe('AccountsService — paymentTermDays (COM-014)', () => {
  it('create defaults paymentTermDays to 30 when omitted', async () => {
    const { svc, accountCreate } = makeService(null);
    await svc.create('c1', 'u1', { name: 'Nueva' } as never);
    const data = (accountCreate.mock.calls[0][0] as Any).data as Any;
    expect(data.paymentTermDays).toBe(30);
  });

  it('create honors an explicit paymentTermDays', async () => {
    const { svc, accountCreate } = makeService(null);
    await svc.create('c1', 'u1', { name: 'Nueva', paymentTermDays: 90 } as never);
    const data = (accountCreate.mock.calls[0][0] as Any).data as Any;
    expect(data.paymentTermDays).toBe(90);
  });

  it('update passes paymentTermDays through (editable in the ficha)', async () => {
    const { svc, accountUpdate } = makeService(null);
    await svc.update('a1', 'c1', 'u1', { paymentTermDays: 60 } as never);
    const data = (accountUpdate.mock.calls[0][0] as Any).data as Any;
    expect(data.paymentTermDays).toBe(60);
  });
});

describe('CreateAccountDto — paymentTermDays validation (COM-014)', () => {
  const validateDto = (obj: Record<string, unknown>) =>
    validate(plainToInstance(CreateAccountDto, obj));
  const termError = (errors: Awaited<ReturnType<typeof validateDto>>) =>
    errors.find((e) => e.property === 'paymentTermDays');

  it.each([30, 60, 90])('accepts %d', async (v) => {
    expect(termError(await validateDto({ name: 'X', paymentTermDays: v }))).toBeUndefined();
  });

  it('rejects a value outside {30,60,90}', async () => {
    expect(termError(await validateDto({ name: 'X', paymentTermDays: 45 }))).toBeDefined();
  });

  it('rejects a non-integer', async () => {
    expect(termError(await validateDto({ name: 'X', paymentTermDays: 30.5 }))).toBeDefined();
  });

  it('is optional — omitted passes (DB @default(30) applies)', async () => {
    expect(termError(await validateDto({ name: 'X' }))).toBeUndefined();
  });
});

/* COM-018 — enterprise link + list enrichment. A separate stateful fake (the COM-003 one
 * above is fixed-shape) with an enterprise table, a findMany that honors the
 * enterpriseId / noEnterprise filters, and a mocked $queryRaw for the DERIVED
 * lastMovementAt (asserted to run ONCE per list call with the companyId and the page ids). */
describe('AccountsService — COM-018 enterprise link + lastMovementAt', () => {
  type Row = Record<string, unknown>;
  function makeService2(
    opts: { enterprises?: Row[]; accounts?: Row[]; lastMovement?: Row[] } = {},
  ) {
    const enterprises = opts.enterprises ?? [
      { id: 'e-active', companyId: 'c1', isActive: true, name: 'Minera' },
      { id: 'e-inactive', companyId: 'c1', isActive: false, name: 'Vieja' },
      { id: 'e-foreign', companyId: 'OTHER', isActive: true, name: 'Ajena' },
    ];
    const accounts = opts.accounts ?? [];
    const accountCreate = jest.fn((args: Row) =>
      Promise.resolve({ id: 'a1', ...(args.data as Row) }),
    );
    const accountUpdate = jest.fn((args: Row) =>
      Promise.resolve({ id: 'a1', ...(args.data as Row) }),
    );
    const accountFindMany = jest.fn((args: Row) => {
      const w = (args.where as Row) ?? {};
      return Promise.resolve(
        accounts.filter(
          (a) =>
            a.companyId === w.companyId &&
            (w.enterpriseId === undefined || (a.enterpriseId ?? null) === w.enterpriseId),
        ),
      );
    });
    const queryRaw = jest.fn(() => Promise.resolve(opts.lastMovement ?? []));
    const prisma = {
      enterprise: {
        findFirst: (args: Row) => {
          const w = args.where as Row;
          return Promise.resolve(
            enterprises.find(
              (e) =>
                e.id === w.id &&
                e.companyId === w.companyId &&
                (w.isActive === undefined || e.isActive === w.isActive),
            ) ?? null,
          );
        },
      },
      account: {
        findFirst: () => Promise.resolve({ id: 'a1', companyId: 'c1' }),
        findMany: accountFindMany,
        create: accountCreate,
        update: accountUpdate,
      },
      $queryRaw: queryRaw,
    } as unknown as ConstructorParameters<typeof AccountsService>[0];
    const rls = {
      executeWithRls: (_c: string, _u: string, fn: (t: unknown) => unknown) => fn(prisma),
    } as unknown as ConstructorParameters<typeof AccountsService>[1];
    return {
      svc: new AccountsService(prisma, rls, {} as never),
      accountCreate,
      accountUpdate,
      accountFindMany,
      queryRaw,
    };
  }

  it('create with a FOREIGN enterprise → 400, no write', async () => {
    const { svc, accountCreate } = makeService2();
    await expect(
      svc.create('c1', 'u1', { name: 'X', enterpriseId: 'e-foreign' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(accountCreate).not.toHaveBeenCalled();
  });

  it('create with an INACTIVE enterprise → 400, no write', async () => {
    const { svc, accountCreate } = makeService2();
    await expect(
      svc.create('c1', 'u1', { name: 'X', enterpriseId: 'e-inactive' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(accountCreate).not.toHaveBeenCalled();
  });

  it('create with an active same-company enterprise links it', async () => {
    const { svc } = makeService2();
    const row = (await svc.create('c1', 'u1', {
      name: 'X',
      enterpriseId: 'e-active',
    } as never)) as Row;
    expect(row.enterpriseId).toBe('e-active');
  });

  it('update with enterpriseId: null clears the link without validation', async () => {
    const { svc, accountUpdate } = makeService2();
    await svc.update('a1', 'c1', 'u1', { enterpriseId: null } as never);
    expect(accountUpdate).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { enterpriseId: null },
    });
  });

  it('list filters: enterpriseId → that enterprise; noEnterprise → unlinked; both → 400', async () => {
    const accounts = [
      { id: 'a-linked', companyId: 'c1', enterpriseId: 'e-active' },
      { id: 'a-free', companyId: 'c1', enterpriseId: null },
      { id: 'a-other', companyId: 'OTHER', enterpriseId: null },
    ];
    const { svc, accountFindMany } = makeService2({ accounts });
    let list = (await svc.findAll('c1', { enterpriseId: 'e-active' })) as Row[];
    expect(list.map((a) => a.id)).toEqual(['a-linked']);
    expect(accountFindMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { companyId: 'c1', enterpriseId: 'e-active' },
        include: { enterprise: { select: { id: true, name: true } } },
      }),
    );
    list = (await svc.findAll('c1', { noEnterprise: true })) as Row[];
    expect(list.map((a) => a.id)).toEqual(['a-free']);
    expect(accountFindMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { companyId: 'c1', enterpriseId: null } }),
    );
    await expect(
      svc.findAll('c1', { enterpriseId: 'e-active', noEnterprise: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lastMovementAt is merged from ONE raw query per list call, carrying the companyId and the page ids', async () => {
    const accounts = [
      { id: 'a1', companyId: 'c1', enterpriseId: null },
      { id: 'a2', companyId: 'c1', enterpriseId: null },
    ];
    const when = new Date('2026-09-10T12:00:00Z');
    const { svc, queryRaw } = makeService2({
      accounts,
      lastMovement: [{ id: 'a1', lastMovementAt: when }],
    });
    const list = (await svc.findAll('c1')) as Row[];
    expect(list.find((a) => a.id === 'a1')?.lastMovementAt).toBe(when.toISOString());
    expect(list.find((a) => a.id === 'a2')?.lastMovementAt).toBeNull();
    expect(queryRaw).toHaveBeenCalledTimes(1);
    // Prisma.sql → sql-template-tag: `.text` renders Postgres $n placeholders.
    const sql = queryRaw.mock.calls[0][0] as unknown as { text: string; values: unknown[] };
    expect(sql.text).toContain('GREATEST(o.last, act.last, n.last, d.last)');
    expect(sql.text).toContain('a."companyId" = $1::uuid AND a.id = ANY($2::uuid[])');
    expect(sql.values).toEqual(['c1', ['a1', 'a2']]);
  });

  it('an empty list skips the raw query', async () => {
    const { svc, queryRaw } = makeService2({ accounts: [] });
    expect(await svc.findAll('c1')).toEqual([]);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
