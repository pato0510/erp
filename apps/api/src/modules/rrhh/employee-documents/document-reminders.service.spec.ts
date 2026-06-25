/* HR-005 — proves the document-expiry reminder selection (a doc expiring in 7
 * days → reminder; an expired one → overdue reminder; the WHERE excludes
 * REPLACED/superseded/no-expiry) and the same-day idempotency. Mirrors
 * contract-reminders.service.spec.ts. */
import { DocumentRemindersService } from './document-reminders.service';

type Any = Record<string, unknown>;

function makeService(prisma: Any, createGeneric: jest.Mock) {
  const notifications = { createGeneric } as unknown as ConstructorParameters<
    typeof DocumentRemindersService
  >[1];
  return new DocumentRemindersService(
    prisma as unknown as ConstructorParameters<typeof DocumentRemindersService>[0],
    notifications,
  );
}

const day = (offset: number) => new Date(Date.now() + offset * 86400000);

const docRow = (over: Partial<Any> = {}) => ({
  id: 'doc-1',
  employeeId: 'emp-1',
  expiryDate: day(7), // ~7 days out → within the 30d window, CRITICAL
  employee: { fullName: 'Ana Díaz' },
  documentType: { name: 'Examen ocupacional' },
  ...over,
});

function prismaWith(opts: { rows?: Any[]; sameDayUserIds?: string[]; capture?: { where?: Any } }) {
  return {
    employeeDocument: {
      findMany: (args: Any) => {
        if (opts.capture) opts.capture.where = args.where as Any;
        return Promise.resolve(opts.rows ?? [docRow()]);
      },
    },
    membership: { findMany: () => Promise.resolve([{ userId: 'm1' }, { userId: 'm2' }]) },
    userNotification: {
      findMany: () => Promise.resolve((opts.sameDayUserIds ?? []).map((userId) => ({ userId }))),
    },
  };
}

describe('DocumentRemindersService.runForCompany — selection', () => {
  it('a doc expiring in 7 days → CRITICAL reminder to all RRHH managers; query is APPROVED + non-superseded + expiry-bearing', async () => {
    const createGeneric = jest.fn().mockResolvedValue({ delivered: 2 });
    const capture: { where?: Any } = {};
    const svc = makeService(prismaWith({ capture }), createGeneric);

    const res = await svc.runForCompany('c1');

    expect(createGeneric).toHaveBeenCalledTimes(1);
    const [companyId, dto] = createGeneric.mock.calls[0];
    expect(companyId).toBe('c1');
    expect(dto.userIds).toEqual(['m1', 'm2']);
    expect(dto.sourceType).toBe('GENERAL');
    expect(dto.severity).toBe('CRITICAL'); // ≤7 days
    expect(dto.title).toContain('por vencer');
    expect(dto.message).toContain('Examen ocupacional');
    expect(dto.linkPath).toContain('doc=doc-1');
    expect(dto.linkPath).toContain('tab=documentos');
    expect(res.notified).toBe(2);
    // the selection excludes REPLACED/ARCHIVED (status APPROVED) + superseded + no-expiry
    expect(capture.where).toMatchObject({
      companyId: 'c1',
      status: 'APPROVED',
      supersededById: null,
    });
    expect((capture.where!.expiryDate as Any).not).toBeNull();
    expect((capture.where!.expiryDate as Any).lte).toBeInstanceOf(Date);
  });

  it('an already-expired doc → OVERDUE (CRITICAL) reminder', async () => {
    const createGeneric = jest.fn().mockResolvedValue({ delivered: 2 });
    const svc = makeService(prismaWith({ rows: [docRow({ expiryDate: day(-3) })] }), createGeneric);

    await svc.runForCompany('c1');

    const dto = createGeneric.mock.calls[0][1];
    expect(dto.severity).toBe('CRITICAL');
    expect(dto.title).toContain('vencido');
    expect(dto.message).toMatch(/venció el .* \(hace 3 días\)/);
  });

  it('escalation by proximity: ~12 days out → WARNING (≤15); ~28 days out → INFO (>15)', async () => {
    const createGeneric = jest.fn().mockResolvedValue({ delivered: 1 });
    let svc = makeService(prismaWith({ rows: [docRow({ expiryDate: day(12) })] }), createGeneric);
    await svc.runForCompany('c1');
    expect(createGeneric.mock.calls[0][1].severity).toBe('WARNING');

    createGeneric.mockClear();
    svc = makeService(prismaWith({ rows: [docRow({ expiryDate: day(28) })] }), createGeneric);
    await svc.runForCompany('c1');
    expect(createGeneric.mock.calls[0][1].severity).toBe('INFO');
  });

  it('no matching docs (REPLACED/superseded/no-expiry excluded by the WHERE) → nothing sent', async () => {
    const createGeneric = jest.fn();
    // empty rows simulates the DB filtering out REPLACED/superseded/no-expiry docs
    const svc = makeService(prismaWith({ rows: [] }), createGeneric);
    const res = await svc.runForCompany('c1');
    expect(createGeneric).not.toHaveBeenCalled();
    expect(res).toEqual({ checked: 0, notified: 0 });
  });
});

describe('DocumentRemindersService — same-day idempotency', () => {
  it('skips users who already got a same-day notice for this document', async () => {
    const createGeneric = jest.fn().mockResolvedValue({ delivered: 1 });
    const svc = makeService(prismaWith({ sameDayUserIds: ['m1'] }), createGeneric); // m1 already today
    await svc.runForCompany('c1');
    expect(createGeneric).toHaveBeenCalledTimes(1);
    expect(createGeneric.mock.calls[0][1].userIds).toEqual(['m2']);
  });

  it('sends nothing when every recipient was already notified today', async () => {
    const createGeneric = jest.fn();
    const svc = makeService(prismaWith({ sameDayUserIds: ['m1', 'm2'] }), createGeneric);
    const res = await svc.runForCompany('c1');
    expect(createGeneric).not.toHaveBeenCalled();
    expect(res.notified).toBe(0);
  });
});
