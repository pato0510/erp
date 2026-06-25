/* HR-007 — proves the contract-expiry reminder fires for a near-expiry
 * PLAZO_FIJO and is idempotent same-day (no duplicate per contract/user). */
import { ContractRemindersService } from './contract-reminders.service';

type Any = Record<string, unknown>;

function makeService(prisma: Any, createGeneric: jest.Mock) {
  const notifications = { createGeneric } as unknown as ConstructorParameters<
    typeof ContractRemindersService
  >[1];
  return new ContractRemindersService(
    prisma as unknown as ConstructorParameters<typeof ContractRemindersService>[0],
    notifications,
  );
}

const near = new Date(Date.now() + 10 * 86400000); // ~10 days out → within the 30d window
const contractRow = {
  id: 'k1',
  employeeId: 'emp-1',
  endDate: near,
  contractType: 'PLAZO_FIJO',
  employee: { fullName: 'Ana Díaz' },
};

function prismaWith(sameDayUserIds: string[], capture?: { where?: Any }) {
  return {
    employeeContract: {
      findMany: (args: Any) => {
        if (capture) capture.where = args.where as Any;
        return Promise.resolve([contractRow]);
      },
    },
    membership: { findMany: () => Promise.resolve([{ userId: 'm1' }, { userId: 'm2' }]) },
    userNotification: {
      findMany: () => Promise.resolve(sameDayUserIds.map((userId) => ({ userId }))),
    },
  };
}

describe('ContractRemindersService.runForCompany', () => {
  it('notifies all RRHH managers for a near-expiry PLAZO_FIJO and queries PRINCIPAL contracts only', async () => {
    const createGeneric = jest.fn().mockResolvedValue({ delivered: 2 });
    const capture: { where?: Any } = {};
    const svc = makeService(prismaWith([], capture), createGeneric);

    const res = await svc.runForCompany('c1');

    expect(createGeneric).toHaveBeenCalledTimes(1);
    const [companyId, dto] = createGeneric.mock.calls[0];
    expect(companyId).toBe('c1');
    expect(dto.userIds).toEqual(['m1', 'm2']);
    expect(dto.sourceType).toBe('GENERAL');
    expect(dto.linkPath).toContain('contract=k1');
    expect(res.notified).toBe(2);
    // anexos must never drive expiry reminders → query filters parentContractId: null
    expect(capture.where).toMatchObject({ parentContractId: null });
  });

  it('skips users who already got a same-day notice for this contract (idempotent)', async () => {
    const createGeneric = jest.fn().mockResolvedValue({ delivered: 1 });
    const svc = makeService(prismaWith(['m1']), createGeneric); // m1 already notified today

    await svc.runForCompany('c1');

    expect(createGeneric).toHaveBeenCalledTimes(1);
    expect(createGeneric.mock.calls[0][1].userIds).toEqual(['m2']);
  });

  it('sends nothing when every recipient was already notified today', async () => {
    const createGeneric = jest.fn();
    const svc = makeService(prismaWith(['m1', 'm2']), createGeneric);

    const res = await svc.runForCompany('c1');

    expect(createGeneric).not.toHaveBeenCalled();
    expect(res.notified).toBe(0);
  });
});
