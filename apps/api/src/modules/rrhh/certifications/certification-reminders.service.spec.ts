/* HR-014 — proves the certification-expiry reminder selection (within window →
 * reminder; expired → overdue; ANULADA/no-expiry excluded) and same-day
 * idempotency. Mirrors the HR-005 document-reminders spec. */
import { CertificationRemindersService } from './certification-reminders.service';

type Any = Record<string, unknown>;
const day = (offset: number) => new Date(Date.now() + offset * 86400000);

function makeService(prisma: Any, createGeneric: jest.Mock) {
  const notifications = { createGeneric } as unknown as ConstructorParameters<
    typeof CertificationRemindersService
  >[1];
  return new CertificationRemindersService(
    prisma as unknown as ConstructorParameters<typeof CertificationRemindersService>[0],
    notifications,
  );
}

const certRow = (over: Partial<Any> = {}) => ({
  id: 'cert-1',
  employeeId: 'emp-1',
  expiryDate: day(7),
  employee: { fullName: 'Ana Díaz' },
  certificationType: { name: 'Trabajo en altura' },
  ...over,
});

function prismaWith(opts: { rows?: Any[]; sameDayUserIds?: string[]; capture?: { where?: Any } }) {
  return {
    certification: {
      findMany: (args: Any) => {
        if (opts.capture) opts.capture.where = args.where as Any;
        return Promise.resolve(opts.rows ?? [certRow()]);
      },
    },
    membership: { findMany: () => Promise.resolve([{ userId: 'm1' }, { userId: 'm2' }]) },
    userNotification: {
      findMany: () => Promise.resolve((opts.sameDayUserIds ?? []).map((userId) => ({ userId }))),
    },
  };
}

describe('CertificationRemindersService.runForCompany', () => {
  it('cert expiring in 7 days → CRITICAL reminder; query filters VIGENTE + expiry-bearing (excludes ANULADA/no-expiry)', async () => {
    const createGeneric = jest.fn().mockResolvedValue({ delivered: 2 });
    const capture: { where?: Any } = {};
    const res = await makeService(prismaWith({ capture }), createGeneric).runForCompany('c1');

    expect(createGeneric).toHaveBeenCalledTimes(1);
    const dto = createGeneric.mock.calls[0][1];
    expect(dto.severity).toBe('CRITICAL');
    expect(dto.sourceType).toBe('GENERAL');
    expect(dto.message).toContain('Trabajo en altura');
    expect(dto.linkPath).toContain('cert=cert-1');
    expect(dto.linkPath).toContain('tab=certificaciones');
    expect(res.notified).toBe(2);
    expect(capture.where).toMatchObject({ companyId: 'c1', status: 'VIGENTE' });
    expect((capture.where!.expiryDate as Any).not).toBeNull();
  });

  it('an expired cert → OVERDUE (CRITICAL) reminder', async () => {
    const createGeneric = jest.fn().mockResolvedValue({ delivered: 2 });
    await makeService(
      prismaWith({ rows: [certRow({ expiryDate: day(-4) })] }),
      createGeneric,
    ).runForCompany('c1');
    const dto = createGeneric.mock.calls[0][1];
    expect(dto.severity).toBe('CRITICAL');
    expect(dto.title).toContain('vencida');
    expect(dto.message).toMatch(/venció el .* \(hace 4 días\)/);
  });

  it('same-day idempotency: skips already-notified users', async () => {
    const createGeneric = jest.fn().mockResolvedValue({ delivered: 1 });
    await makeService(prismaWith({ sameDayUserIds: ['m1'] }), createGeneric).runForCompany('c1');
    expect(createGeneric.mock.calls[0][1].userIds).toEqual(['m2']);
  });

  it('no matching certs → nothing sent', async () => {
    const createGeneric = jest.fn();
    const res = await makeService(prismaWith({ rows: [] }), createGeneric).runForCompany('c1');
    expect(createGeneric).not.toHaveBeenCalled();
    expect(res).toEqual({ checked: 0, notified: 0 });
  });
});
