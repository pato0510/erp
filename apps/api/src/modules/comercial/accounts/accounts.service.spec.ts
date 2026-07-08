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
