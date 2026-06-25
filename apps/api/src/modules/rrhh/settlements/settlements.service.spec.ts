/* HR-009 — proves costo empresa is a SUM of entered values (not a derivation),
 * soft validation warns WITHOUT blocking the save, and the aggregate returns only
 * sums (no per-person rows). Fake Prisma/RLS clients. */
import { SettlementsService } from './settlements.service';

type Any = Record<string, unknown>;

function makeService(prisma: Any, tx: Any = {}) {
  const rls = {
    executeWithRls: (_c: string, _u: string, fn: (t: Any) => unknown) => fn(tx),
  } as unknown as ConstructorParameters<typeof SettlementsService>[1];
  return new SettlementsService(
    prisma as unknown as ConstructorParameters<typeof SettlementsService>[0],
    rls,
  );
}

/* A fully-reconciling settlement: haberes 1,000,000 − descuentos 200,000 = líquido
   800,000; descuentos sum to 200,000. */
const goodDto = {
  employeeId: 'e1',
  periodYear: 2026,
  periodMonth: 3,
  haberesImponibles: 1_000_000,
  haberesNoImponibles: 0,
  totalHaberes: 1_000_000,
  descUAfp: 115_000,
  descSalud: 70_000,
  descAfc: 6_000,
  descImpuestoUnico: 0,
  otrosDescuentos: 9_000,
  totalDescuentos: 200_000,
  liquidoPagado: 800_000,
  aporteAfcEmpleador: 24_000,
  aporteSis: 15_000,
};

function prismaForCreate(capture: { data?: Any }) {
  return {
    prisma: {
      employee: { findFirst: () => Promise.resolve({ id: 'e1' }) },
      payrollParameterSet: { findFirst: () => Promise.resolve(null) }, // no AFP hint
    },
    tx: {
      payrollSettlement: {
        create: (args: Any) => {
          capture.data = (args as Any).data as Any;
          return Promise.resolve({ id: 's1', ...(args.data as Any) });
        },
      },
    },
  };
}

describe('SettlementsService.create — costo empresa SUM + soft validation', () => {
  it('costoEmpresaComputed = totalHaberes + employer aportes (a SUM, not derived); no warnings when reconciled', async () => {
    const cap: { data?: Any } = {};
    const { prisma, tx } = prismaForCreate(cap);
    const svc = makeService(prisma, tx);
    const res = (await svc.create('c1', 'u1', { ...goodDto } as Any)) as Any;

    // 1,000,000 + 24,000 + 15,000 = 1,039,000 — purely the sum of entered values
    expect(res.costoEmpresaComputed).toBe(1_039_000);
    expect(res.warnings).toEqual([]);
  });

  it('warns when líquido / descuentos do not reconcile — but STILL SAVES', async () => {
    const cap: { data?: Any } = {};
    const { prisma, tx } = prismaForCreate(cap);
    const svc = makeService(prisma, tx);
    // líquido 700,000 ≠ haberes−descuentos (800,000) → advisory warning
    const res = (await svc.create('c1', 'u1', {
      ...goodDto,
      liquidoPagado: 700_000,
    } as Any)) as Any;

    expect((res.warnings as string[]).length).toBeGreaterThan(0);
    expect((res.warnings as string[]).some((w) => /no cuadra/.test(w))).toBe(true);
    // the row was still persisted (tx.create captured the data) — never blocked
    expect(cap.data).toBeDefined();
    expect(res.id).toBe('s1');
  });

  it('warns when the descuentos do not sum to totalDescuentos — but still saves', async () => {
    const cap: { data?: Any } = {};
    const { prisma, tx } = prismaForCreate(cap);
    const svc = makeService(prisma, tx);
    const res = (await svc.create('c1', 'u1', {
      ...goodDto,
      totalDescuentos: 250_000,
      liquidoPagado: 750_000,
    } as Any)) as Any;
    expect((res.warnings as string[]).some((w) => /no coincide con la suma/.test(w))).toBe(true);
    expect(cap.data).toBeDefined();
  });
});

describe('SettlementsService.aggregate — sums only, NO per-person rows', () => {
  it('returns headcount + sum líquido/haberes/costo empresa, no per-person breakdown', async () => {
    const prisma = {
      payrollSettlement: {
        aggregate: () =>
          Promise.resolve({
            _sum: {
              liquidoPagado: '2400000',
              totalHaberes: '3000000',
              aporteAfcEmpleador: '72000',
              aporteSis: '45000',
              aporteMutual: null,
              otrosAportesEmpleador: null,
            },
            _count: { _all: 3 },
          }),
      },
    };
    const svc = makeService(prisma);
    const res = (await svc.aggregate('c1', 2026, 3)) as Any;

    expect(res.headcount).toBe(3);
    expect(res.sumLiquido).toBe(2_400_000);
    expect(res.sumHaberes).toBe(3_000_000);
    // costo empresa = sumHaberes + employer aportes (72,000 + 45,000)
    expect(res.sumCostoEmpresa).toBe(3_117_000);
    // payload carries NO array of per-person rows
    expect(Object.values(res).some((v) => Array.isArray(v))).toBe(false);
  });
});
