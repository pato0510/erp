/* HR-008 — proves the seed creates the verified 2026 set with the 4 unverified
 * AFP comisiones left NULL (not invented), idempotency, and the /current
 * date-window query shape. Fake Prisma/RLS clients. */
import { PayrollParametersService } from './payroll-parameters.service';

type Any = Record<string, unknown>;

function makeService(prisma: Any, tx: Any = {}) {
  const rls = {
    executeWithRls: (_c: string, _u: string, fn: (t: Any) => unknown) => fn(tx),
  } as unknown as ConstructorParameters<typeof PayrollParametersService>[1];
  return new PayrollParametersService(
    prisma as unknown as ConstructorParameters<typeof PayrollParametersService>[0],
    rls,
  );
}

describe('PayrollParametersService.seed2026', () => {
  it('creates the verified 2026 set + 7 AFP rows (3 with comisión, 4 NULL — not invented)', async () => {
    let setData: Any = {};
    let afpData: Any[] = [];
    const created = { id: 'set-1', name: '2026' };
    const tx = {
      payrollParameterSet: {
        create: (args: Any) => {
          setData = (args as Any).data as Any;
          return Promise.resolve(created);
        },
      },
      afpRate: {
        createMany: (args: Any) => {
          afpData = (args as Any).data as Any[];
          return Promise.resolve({ count: afpData.length });
        },
      },
    };
    const prisma = {
      payrollParameterSet: {
        findFirst: () => Promise.resolve(null), // not yet seeded
        findFirstOrThrow: () => Promise.resolve({ id: 'set-1' }),
        // findOne() re-reads with afpRates after seeding
        findUnique: () => Promise.resolve(null),
      },
    };
    // findOne uses findFirst on the set with include — stub the second findFirst
    let findFirstCalls = 0;
    prisma.payrollParameterSet.findFirst = () => {
      findFirstCalls++;
      if (findFirstCalls === 1) return Promise.resolve(null); // idempotency check
      return Promise.resolve({ id: 'set-1', name: '2026', afpRates: afpData }); // findOne re-read
    };

    const svc = makeService(prisma, tx);
    const res = (await svc.seed2026('c1', 'u1')) as Any;

    expect(res.created).toBe(true);
    // verified topes/tasas stored as DATA
    expect(setData.topeImponibleAfpSaludUf).toBe(90.0);
    expect(setData.topeImponibleAfcUf).toBe(135.2);
    expect(setData.tasaAfpObligatoria).toBe(10.0);
    expect(setData.tasaSalud).toBe(7.0);
    expect(setData.tasaAfcIndefinidoTrabajador).toBe(0.6);
    expect(setData.tasaAfcIndefinidoEmpleador).toBe(2.4);
    expect(setData.tasaAfcPlazoFijoEmpleador).toBe(3.0);
    expect(setData.tasaSis).toBe(1.53);

    // 7 AFP rows: 3 verified, 4 NULL
    expect(afpData).toHaveLength(7);
    const byName = Object.fromEntries(
      afpData.map((a) => [(a as Any).afpName, (a as Any).comisionPorcentaje]),
    );
    expect(byName['Uno']).toBe(0.49);
    expect(byName['Modelo']).toBe(0.58);
    expect(byName['Provida']).toBe(1.45);
    for (const n of ['Capital', 'Cuprum', 'Habitat', 'PlanVital']) {
      expect(byName[n]).toBeNull(); // NOT invented
    }
  });

  it('is idempotent — returns the existing set without re-creating', async () => {
    const prisma = {
      payrollParameterSet: {
        findFirst: () => Promise.resolve({ id: 'set-1', name: '2026', afpRates: [] }),
      },
    };
    const created = jest.fn();
    const tx = { payrollParameterSet: { create: created } };
    const svc = makeService(prisma, tx);
    const res = (await svc.seed2026('c1', 'u1')) as Any;
    expect(res.created).toBe(false);
    expect(created).not.toHaveBeenCalled();
  });
});

describe('PayrollParametersService.getCurrent', () => {
  it('queries the vigente window (effectiveFrom<=today AND (effectiveTo null OR >=today), active)', async () => {
    let where: Any = {};
    const prisma = {
      payrollParameterSet: {
        findFirst: (args: Any) => {
          where = (args as Any).where as Any;
          return Promise.resolve(null);
        },
      },
    };
    const svc = makeService(prisma);
    await svc.getCurrent('c1');
    expect(where.active).toBe(true);
    expect((where.effectiveFrom as Any).lte).toBeInstanceOf(Date);
    expect(Array.isArray(where.OR)).toBe(true);
    // one branch is effectiveTo null, the other effectiveTo >= today
    const ors = where.OR as Any[];
    expect(ors.some((o) => (o as Any).effectiveTo === null)).toBe(true);
    expect(ors.some((o) => ((o as Any).effectiveTo as Any)?.gte instanceof Date)).toBe(true);
  });
});
