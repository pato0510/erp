/* HR-011 — proves the service WIRES the certified calc correctly (the math
 * itself is proven in vacation-calc.spec): create computes Mon–Fri diasHabiles
 * (admin-overridable), the balance assembler reads the annual parameter +
 * díasAdicionales and buckets requests, and the workflow guards hold. */
import { round2 } from './vacation-calc';
import { VacationsService } from './vacations.service';

type Any = Record<string, unknown>;
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function makeService(prisma: Any, tx: Any = {}) {
  const rls = {
    executeWithRls: (_c: string, _u: string, fn: (t: Any) => unknown) => fn(tx),
  } as unknown as ConstructorParameters<typeof VacationsService>[1];
  return new VacationsService(
    prisma as unknown as ConstructorParameters<typeof VacationsService>[0],
    rls,
  );
}

describe('VacationsService.create', () => {
  const baseEmployee = { id: 'e1', hireDate: d('2025-01-01'), diasAdicionalesFeriado: 0 };

  it('computes Mon–Fri diasHabiles (a full week = 5), status PENDIENTE, requestedBy set', async () => {
    let captured: Any = {};
    const prisma = {
      employee: { findFirst: () => Promise.resolve(baseEmployee) },
      companySettings: { findUnique: () => Promise.resolve({ feriadoAnualDiasHabiles: 15 }) },
      vacationRequest: { findMany: () => Promise.resolve([]) },
    };
    const tx = {
      vacationRequest: {
        create: (args: Any) => {
          captured = args;
          return Promise.resolve({ id: 'v1', ...(args.data as Any) });
        },
      },
    };
    const svc = makeService(prisma, tx);
    const res = (await svc.create('c1', 'u1', {
      employeeId: 'e1',
      startDate: '2025-06-02', // Monday
      endDate: '2025-06-06', // Friday
    } as Any)) as Any;

    const data = captured.data as Any;
    expect(data.diasHabiles).toBe(5);
    expect(data.status).toBe('PENDIENTE');
    expect(data.requestedBy).toBe('u1');
    expect(Array.isArray(res.warnings)).toBe(true);
  });

  it('honours an admin diasHabiles override (festivos)', async () => {
    let captured: Any = {};
    const prisma = {
      employee: { findFirst: () => Promise.resolve(baseEmployee) },
      companySettings: { findUnique: () => Promise.resolve({ feriadoAnualDiasHabiles: 15 }) },
      vacationRequest: { findMany: () => Promise.resolve([]) },
    };
    const tx = {
      vacationRequest: {
        create: (args: Any) => {
          captured = args;
          return Promise.resolve({ id: 'v1', ...(args.data as Any) });
        },
      },
    };
    const svc = makeService(prisma, tx);
    await svc.create('c1', 'u1', {
      employeeId: 'e1',
      startDate: '2025-06-02',
      endDate: '2025-06-06',
      diasHabiles: 4, // festivo in the middle
    } as Any);
    expect((captured.data as Any).diasHabiles).toBe(4);
  });

  it('rejects endDate before startDate', async () => {
    const prisma = { employee: { findFirst: () => Promise.resolve(baseEmployee) } };
    const svc = makeService(prisma);
    await expect(
      svc.create('c1', 'u1', {
        employeeId: 'e1',
        startDate: '2025-06-06',
        endDate: '2025-06-02',
      } as Any),
    ).rejects.toThrow(/no puede ser anterior/);
  });
});

describe('VacationsService.getBalance — assembler wiring', () => {
  it('reads annual parameter + díasAdicionales and buckets requests', async () => {
    const prisma = {
      employee: {
        findFirst: () =>
          Promise.resolve({ id: 'e1', hireDate: d('2025-01-01'), diasAdicionalesFeriado: 2 }),
      },
      companySettings: { findUnique: () => Promise.resolve({ feriadoAnualDiasHabiles: 15 }) },
      vacationRequest: {
        findMany: () =>
          Promise.resolve([
            { status: 'APROBADO', diasHabiles: 5 },
            { status: 'TOMADO', diasHabiles: 2 },
            { status: 'PENDIENTE', diasHabiles: 3 },
            { status: 'CANCELADO', diasHabiles: 9 },
          ]),
      },
    };
    const svc = makeService(prisma);
    const bal = (await svc.getBalance('c1', 'e1')) as Any;
    expect(bal.feriadoAnualDiasHabiles).toBe(15);
    expect(bal.diasAdicionales).toBe(2);
    expect(bal.tomados).toBe(7); // 5 + 2
    expect(bal.pendientes).toBe(3); // not subtracted
    // saldo = devengado + adicionales − tomados (relation holds regardless of "today")
    expect(bal.saldoDisponible).toBe(round2((bal.devengado as number) + 2 - 7));
  });

  it('defaults the annual parameter to 15 when no CompanySettings row exists', async () => {
    const prisma = {
      employee: {
        findFirst: () =>
          Promise.resolve({ id: 'e1', hireDate: d('2025-01-01'), diasAdicionalesFeriado: 0 }),
      },
      companySettings: { findUnique: () => Promise.resolve(null) },
      vacationRequest: { findMany: () => Promise.resolve([]) },
    };
    const svc = makeService(prisma);
    const bal = (await svc.getBalance('c1', 'e1')) as Any;
    expect(bal.feriadoAnualDiasHabiles).toBe(15);
  });
});

describe('VacationsService.approve', () => {
  it('rejects approving a non-PENDIENTE request', async () => {
    const prisma = {
      vacationRequest: { findFirst: () => Promise.resolve({ id: 'v1', status: 'APROBADO' }) },
    };
    const svc = makeService(prisma);
    await expect(svc.approve('v1', 'c1', 'u1')).rejects.toThrow(/PENDIENTES/);
  });
});
