/* HR-010 — proves /estimate is EPHEMERAL (writes nothing), the feriado/base
 * defaults are resolved, and persist() re-computes + flips employee status
 * atomically only when markEmployeeDesvinculado=true. Fake Prisma/RLS/Vacations. */
import { TerminationsService } from './terminations.service';

type Any = Record<string, unknown>;
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function makeService(opts: { prisma?: Any; tx?: Any; saldo?: number }) {
  const prisma = {
    employee: {
      findFirst: () => Promise.resolve({ id: 'e1', hireDate: d('2021-01-01'), status: 'ACTIVO' }),
    },
    employeeCompensation: { findFirst: () => Promise.resolve({ baseSalaryGross: '1000000' }) },
    terminationRecord: {
      findMany: () => Promise.resolve([]),
      findFirst: () => Promise.resolve(null),
    },
    ...opts.prisma,
  };
  const rls = {
    executeWithRls: (_c: string, _u: string, fn: (t: Any) => unknown) => fn(opts.tx ?? {}),
  } as unknown as ConstructorParameters<typeof TerminationsService>[1];
  const vacations = {
    getBalance: () => Promise.resolve({ saldoDisponible: opts.saldo ?? 0 }),
  } as unknown as ConstructorParameters<typeof TerminationsService>[2];
  return new TerminationsService(
    prisma as unknown as ConstructorParameters<typeof TerminationsService>[0],
    rls,
    vacations,
  );
}

const estimateDto = {
  employeeId: 'e1',
  causal: 'NECESIDADES_EMPRESA',
  terminationDate: '2026-01-01', // 5 years from 2021-01-01
  ufValue: 39000,
  avisoPrevioDado: false,
} as Any;

describe('TerminationsService.estimate — EPHEMERAL', () => {
  it('computes the breakdown (defaults base from compensation, feriado from HR-011 saldo) and WRITES NOTHING', async () => {
    let createCalled = false;
    const tx = {
      terminationRecord: {
        create: () => {
          createCalled = true;
          return Promise.resolve({});
        },
      },
    };
    // executeWithRls is the ONLY write path; estimate must never call it.
    let rlsCalled = false;
    const svc = makeService({ tx, saldo: 10 });
    // wrap rls to detect any call
    (svc as unknown as { rlsService: Any }).rlsService = {
      executeWithRls: (_c: string, _u: string, fn: (t: Any) => unknown) => {
        rlsCalled = true;
        return fn(tx);
      },
    };

    const r = (await svc.estimate('c1', estimateDto)) as Any;

    expect(r.montoIas).toBe(5_000_000); // base 1M (from compensation) × 5 años
    expect(r.montoAvisoPrevio).toBe(1_000_000); // no notice given
    expect(r.feriadoDias).toBe(10); // from saldo
    expect(r.montoFeriado).toBe(Math.round(10 * (1_000_000 / 30) * 100) / 100);
    expect(r.disclaimer).toMatch(/Estimación referencial/);
    // EPHEMERAL: neither the write tx nor the create was touched
    expect(rlsCalled).toBe(false);
    expect(createCalled).toBe(false);
  });

  it('clamps a negative vacation saldo to 0 feriado días', async () => {
    const svc = makeService({ saldo: -3 });
    const r = (await svc.estimate('c1', estimateDto)) as Any;
    expect(r.feriadoDias).toBe(0);
  });
});

describe('TerminationsService.create — persist + atomic desvinculado', () => {
  function captureTx() {
    const calls: { op: string; args: Any }[] = [];
    return {
      calls,
      tx: {
        terminationRecord: {
          create: (args: Any) => {
            calls.push({ op: 'record.create', args });
            return Promise.resolve({ id: 't1', ...(args.data as Any) });
          },
        },
        employee: {
          update: (args: Any) => {
            calls.push({ op: 'employee.update', args });
            return Promise.resolve({ id: 'e1' });
          },
        },
      },
    };
  }

  it('persists the re-computed record; markEmployeeDesvinculado=true flips status in the SAME tx', async () => {
    const { calls, tx } = captureTx();
    const svc = makeService({ tx, saldo: 0 });
    const res = (await svc.create('c1', 'u1', {
      ...estimateDto,
      markEmployeeDesvinculado: true,
    })) as Any;

    const rec = calls.find((c) => c.op === 'record.create')!.args.data as Any;
    expect(rec.montoIas).toBe(5_000_000); // re-computed server-side
    expect(rec.montoTotal).toBe(6_000_000); // IAS + aviso (no notice)
    expect(rec.status).toBe('REGISTRADO');
    const emp = calls.find((c) => c.op === 'employee.update');
    expect(emp).toBeDefined();
    expect((emp!.args.data as Any).status).toBe('DESVINCULADO');
    expect(res.employeeMarkedDesvinculado).toBe(true);
  });

  it('markEmployeeDesvinculado falsy → record persisted, employee status NOT touched', async () => {
    const { calls, tx } = captureTx();
    const svc = makeService({ tx, saldo: 0 });
    await svc.create('c1', 'u1', { ...estimateDto });
    expect(calls.some((c) => c.op === 'record.create')).toBe(true);
    expect(calls.some((c) => c.op === 'employee.update')).toBe(false);
  });
});
