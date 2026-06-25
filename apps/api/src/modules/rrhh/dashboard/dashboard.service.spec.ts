/* HR-006 — proves the dashboard aggregations and, critically, that the payroll
 * endpoint returns ONLY the company-wide aggregate (never per-person salary).
 * Uses fake Prisma/RLS clients (same style as employees.security.spec.ts). */
import { DashboardService } from './dashboard.service';

type Any = Record<string, unknown>;

function makeService(tx: Any) {
  const prisma = {} as unknown as ConstructorParameters<typeof DashboardService>[0];
  const rls = {
    executeWithRls: (_c: string, _u: string, fn: (t: Any) => unknown) => fn(tx),
  } as unknown as ConstructorParameters<typeof DashboardService>[1];
  return new DashboardService(prisma, rls);
}

describe('DashboardService.getOverview', () => {
  it('aggregates dotación + documents (excluding REPLACED) and returns honest contract placeholder', async () => {
    const docCountWheres: Any[] = [];
    const tx = {
      employee: {
        count: (args: Any) => Promise.resolve((args.where as Any).status === 'ACTIVO' ? 7 : 10),
        groupBy: (args: Any) =>
          Promise.resolve(
            (args.by as string[])[0] === 'area'
              ? [
                  { area: 'OPERACIONES', _count: { _all: 5 } },
                  { area: 'FINANZAS', _count: { _all: 2 } },
                ]
              : [
                  { status: 'ACTIVO', _count: { _all: 7 } },
                  { status: 'DESVINCULADO', _count: { _all: 3 } },
                ],
          ),
        findMany: () =>
          Promise.resolve([
            { id: 'e1', fullName: 'Ana', area: 'OPERACIONES', status: 'ACTIVO', jobPosition: null },
          ]),
      },
      employeeDocument: {
        count: (args: Any) => {
          docCountWheres.push(args.where);
          return Promise.resolve(2);
        },
        findMany: () =>
          Promise.resolve([
            {
              id: 'd1',
              expiryDate: new Date('2999-01-01'),
              employee: { id: 'e1', fullName: 'Ana' },
              documentType: { id: 't1', name: 'Contrato' },
            },
          ]),
      },
    };
    const svc = makeService(tx);
    const res = (await svc.getOverview('c1', 'u1')) as Any;

    const dotacion = res.dotacion as Any;
    expect(dotacion.activos).toBe(7);
    expect(dotacion.total).toBe(10);
    // porArea sorted desc by count
    expect((dotacion.porArea as Any[])[0]).toEqual({ area: 'OPERACIONES', count: 5 });

    // every expiry-bucket count must exclude REPLACED via APPROVED + supersededById:null
    const expiryWheres = docCountWheres.filter((w) => (w as Any).status === 'APPROVED');
    expect(expiryWheres.length).toBe(3);
    for (const w of expiryWheres) expect((w as Any).supersededById).toBeNull();

    // honest placeholder, not a fabricated number
    expect((res.contratos as Any).available).toBe(false);
    expect((res.contratos as Any).proximasRenovaciones).toEqual([]);
  });
});

describe('DashboardService.getPayroll — aggregate only, no per-person leak', () => {
  it('returns the company-wide sum/counts and NEVER queries per-person compensation rows', async () => {
    const tx = {
      employeeCompensation: {
        aggregate: () =>
          Promise.resolve({ _sum: { baseSalaryGross: '4500000' }, _count: { _all: 3 } }),
        // NOTE: no findMany — if the service tried to read per-person rows it would throw.
      },
      employee: {
        count: (args: Any) => Promise.resolve((args.where as Any).status === 'ACTIVO' ? 7 : 10),
      },
    };
    const svc = makeService(tx);
    const res = (await svc.getPayroll('c1', 'u1')) as Any;

    expect(res.grossMonthly).toBe(4500000); // Decimal string → Number
    expect(res.employeesWithCompensation).toBe(3);
    expect(res.employeesActive).toBe(7);
    expect(res.employeesTotal).toBe(10);
    expect(res.netMonthly).toBeNull(); // not fabricated

    // no array of per-person salaries anywhere in the payload
    const hasArray = Object.values(res).some((v) => Array.isArray(v));
    expect(hasArray).toBe(false);
  });
});
