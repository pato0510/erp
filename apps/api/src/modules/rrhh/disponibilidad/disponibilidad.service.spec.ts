/* HR-015 — proves the availability state resolution (reusing the HR-011/HR-012
 * predicates), the matriz reuse of HR-014 compliance, the alertas selection, and
 * that NO salary/compensation field appears in any payload. Fake clients. */
import { DisponibilidadService } from './disponibilidad.service';

type Any = Record<string, unknown>;
const day = (offset: number) => {
  const d = new Date(Date.now() + offset * 86400000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

function makeService(tx: Any, certifications: Any = {}) {
  const prisma = {} as unknown as ConstructorParameters<typeof DisponibilidadService>[0];
  const rls = {
    executeWithRls: (_c: string, _u: string, fn: (t: Any) => unknown) => fn(tx),
  } as unknown as ConstructorParameters<typeof DisponibilidadService>[1];
  return new DisponibilidadService(
    prisma,
    rls,
    certifications as unknown as ConstructorParameters<typeof DisponibilidadService>[2],
  );
}

/* Recursively assert no salary/compensation key appears anywhere in a payload. */
const SALARY_KEYS =
  /salary|sueldo|liquido|liquid|compensa|monto|finiquito|settlement|baseSalary|haberes|descuento/i;
function assertNoSalary(obj: unknown) {
  if (obj === null || typeof obj !== 'object') return;
  for (const [k, v] of Object.entries(obj as Any)) {
    expect(SALARY_KEYS.test(k)).toBe(false);
    if (typeof v === 'object') assertNoSalary(v);
  }
}

const EMPLOYEES = [
  { id: 'e1', fullName: 'Ana', area: 'OPERACIONES', jobPosition: { id: 'jp', name: 'Operador' } },
  { id: 'e2', fullName: 'Beto', area: 'OPERACIONES', jobPosition: { id: 'jp', name: 'Operador' } },
  { id: 'e3', fullName: 'Cata', area: 'FINANZAS', jobPosition: null },
];

describe('DisponibilidadService.getAvailability — state resolution', () => {
  it('blocking absence → NO_DISPONIBLE (with reason); vacation → VACACIONES; else DISPONIBLE', async () => {
    const tx = {
      employee: { findMany: () => Promise.resolve(EMPLOYEES) },
      absence: {
        // e2 has an approved blocking licencia covering the date
        findMany: () =>
          Promise.resolve([
            {
              employeeId: 'e2',
              category: 'LICENCIA',
              endDate: day(3),
              absenceType: { name: 'Licencia médica tipo 1' },
            },
          ]),
      },
      vacationRequest: {
        // e1 is on an approved vacation covering the date
        findMany: () => Promise.resolve([{ employeeId: 'e1', endDate: day(5) }]),
      },
    };
    const res = (await makeService(tx).getAvailability('co', 'u1')) as Any;
    const byId = Object.fromEntries(
      (res.employees as Any[]).map((r) => [(r as Any).employeeId, r]),
    );
    expect((byId.e1 as Any).state).toBe('VACACIONES');
    expect((byId.e2 as Any).state).toBe('NO_DISPONIBLE');
    expect((byId.e2 as Any).reason).toBe('Licencia médica tipo 1');
    expect((byId.e3 as Any).state).toBe('DISPONIBLE');
    expect(res.summary).toMatchObject({
      total: 3,
      disponibles: 1,
      noDisponibles: 1,
      vacaciones: 1,
    });
    assertNoSalary(res);
  });

  it('precedence: vacation wins over a blocking absence on the same day', async () => {
    const tx = {
      employee: { findMany: () => Promise.resolve([EMPLOYEES[0]]) },
      absence: {
        findMany: () =>
          Promise.resolve([
            {
              employeeId: 'e1',
              category: 'PERMISO',
              endDate: day(2),
              absenceType: { name: 'Permiso' },
            },
          ]),
      },
      vacationRequest: { findMany: () => Promise.resolve([{ employeeId: 'e1', endDate: day(4) }]) },
    };
    const res = (await makeService(tx).getAvailability('co', 'u1')) as Any;
    expect(((res.employees as Any[])[0] as Any).state).toBe('VACACIONES');
  });

  it('the date param feeds the where predicate (covering-date filter)', async () => {
    let absWhere: Any = {};
    let vacWhere: Any = {};
    const tx = {
      employee: { findMany: () => Promise.resolve([]) },
      absence: {
        findMany: (a: Any) => {
          absWhere = (a as Any).where;
          return Promise.resolve([]);
        },
      },
      vacationRequest: {
        findMany: (a: Any) => {
          vacWhere = (a as Any).where;
          return Promise.resolve([]);
        },
      },
    };
    await makeService(tx).getAvailability('co', 'u1', '2026-08-15');
    // HR-012/HR-011 predicate: status APROBADO + startDate<=date + endDate>=date
    expect(absWhere).toMatchObject({ status: 'APROBADO', blocksAvailability: true });
    expect((absWhere.startDate as Any).lte).toBeInstanceOf(Date);
    expect((absWhere.endDate as Any).gte).toBeInstanceOf(Date);
    // vacation consumed-time set mirrors HR-011 computeBalance (APROBADO + TOMADO)
    expect((vacWhere.status as Any).in).toEqual(['APROBADO', 'TOMADO']);
  });
});

describe('DisponibilidadService — HR-016 for-service contract (reuses HR-015 resolution)', () => {
  /* tx that resolves availability for a fixed roster: e1 on vacation, e2 on a
     blocking licencia, e3 free. Covering-record queries honour the employeeId
     filter so single/batch/unknown all derive from the same predicates. */
  const makeForServiceTx = (roster = EMPLOYEES) => ({
    employee: {
      findFirst: (a: Any) =>
        Promise.resolve(roster.find((e) => e.id === (a as Any).where.id) ?? null),
      findMany: (a: Any) => {
        const where = (a as Any).where as Any;
        const ids = (where.id as Any)?.in as string[] | undefined;
        const pool = where.status === 'ACTIVO' ? roster : roster;
        return Promise.resolve(ids ? pool.filter((e) => ids.includes(e.id)) : pool);
      },
    },
    absence: {
      findMany: (a: Any) => {
        const ids = ((a as Any).where.employeeId as Any)?.in as string[] | undefined;
        const all = [
          {
            employeeId: 'e2',
            category: 'LICENCIA',
            endDate: day(3),
            absenceType: { name: 'Licencia médica tipo 1' },
          },
        ];
        return Promise.resolve(ids ? all.filter((x) => ids.includes(x.employeeId)) : all);
      },
    },
    vacationRequest: {
      findMany: (a: Any) => {
        const ids = ((a as Any).where.employeeId as Any)?.in as string[] | undefined;
        const all = [{ employeeId: 'e1', endDate: day(5) }];
        return Promise.resolve(ids ? all.filter((x) => ids.includes(x.employeeId)) : all);
      },
    },
  });

  it('forServiceSingle: vacation / licencia / free resolve to the documented shape; no salary', async () => {
    const svc = makeService(makeForServiceTx());

    const onVac = (await svc.forServiceSingle('co', 'u1', 'e1')) as Any;
    expect(onVac).toMatchObject({
      employeeId: 'e1',
      fullName: 'Ana',
      available: false,
      state: 'VACACIONES',
      reason: 'Vacaciones',
    });
    expect(typeof onVac.date).toBe('string');
    expect(onVac.until).toBeInstanceOf(Date);

    const onLeave = (await svc.forServiceSingle('co', 'u1', 'e2')) as Any;
    expect(onLeave).toMatchObject({
      state: 'NO_DISPONIBLE',
      available: false,
      reason: 'Licencia médica tipo 1',
    });

    const free = (await svc.forServiceSingle('co', 'u1', 'e3')) as Any;
    expect(free).toMatchObject({ state: 'DISPONIBLE', available: true, reason: null, until: null });

    assertNoSalary(onVac);
    assertNoSalary(onLeave);
    assertNoSalary(free);
  });

  it('forServiceSingle: unknown employee → 404', async () => {
    const svc = makeService(makeForServiceTx());
    await expect(svc.forServiceSingle('co', 'u1', 'ghost')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('forServiceBatch: roster shape, batched (NOT N+1), ids not in company ignored; no salary', async () => {
    let absCalls = 0;
    let vacCalls = 0;
    const baseTx = makeForServiceTx();
    const tx = {
      ...baseTx,
      absence: {
        findMany: (a: Any) => {
          absCalls += 1;
          return baseTx.absence.findMany(a);
        },
      },
      vacationRequest: {
        findMany: (a: Any) => {
          vacCalls += 1;
          return baseTx.vacationRequest.findMany(a);
        },
      },
    };
    const res = (await makeService(tx).forServiceBatch('co', 'u1', [
      'e1',
      'e2',
      'e3',
      'ghost',
    ])) as Any;

    expect(res.requested).toBe(4); // ghost counted as requested…
    expect(res.count).toBe(3); // …but ignored in the results (not in company)
    const items = res.items as Any[];
    expect(items.map((i) => (i as Any).state).sort()).toEqual([
      'DISPONIBLE',
      'NO_DISPONIBLE',
      'VACACIONES',
    ]);
    // each item is the same self-describing shape
    items.forEach((i) => {
      expect(i).toEqual(
        expect.objectContaining({
          employeeId: expect.any(String),
          fullName: expect.any(String),
          available: expect.any(Boolean),
          state: expect.any(String),
        }),
      );
    });
    // two batched covering-record queries for the WHOLE roster, not one-per-employee
    expect(absCalls).toBe(1);
    expect(vacCalls).toBe(1);
    assertNoSalary(res);
  });

  it('forServiceBatch: empty list → 400; over the cap → 400', async () => {
    const svc = makeService(makeForServiceTx());
    await expect(svc.forServiceBatch('co', 'u1', ['', '  '])).rejects.toMatchObject({
      status: 400,
    });
    const tooMany = Array.from({ length: 101 }, (_, i) => `id${i}`);
    await expect(svc.forServiceBatch('co', 'u1', tooMany)).rejects.toMatchObject({ status: 400 });
  });

  it('forServiceDisponibles: only the DISPONIBLE active employees, with cargo; no salary', async () => {
    const res = (await makeService(makeForServiceTx()).forServiceDisponibles('co', 'u1')) as Any;
    const emps = res.employees as Any[];
    expect(emps.map((e) => (e as Any).employeeId)).toEqual(['e3']); // e1 vac, e2 licencia excluded
    expect(emps[0]).toMatchObject({ employeeId: 'e3', fullName: 'Cata', cargo: null });
    expect(res.count).toBe(1);
    assertNoSalary(res);
  });

  it('for-service resolution MATCHES the HR-015 board for the same date', async () => {
    const svc = makeService(makeForServiceTx());
    const board = (await svc.getAvailability('co', 'u1')) as Any;
    const boardById = Object.fromEntries(
      (board.employees as Any[]).map((r) => [(r as Any).employeeId, (r as Any).state]),
    );
    for (const id of ['e1', 'e2', 'e3']) {
      const single = (await svc.forServiceSingle('co', 'u1', id)) as Any;
      expect(single.state).toBe(boardById[id]);
    }
  });
});

describe('DisponibilidadService.getMatriz — reuses HR-014 compliance', () => {
  it('builds a row per employee from CertificationsService.compliance + a column union; no salary', async () => {
    const tx = { employee: { findMany: () => Promise.resolve([EMPLOYEES[0], EMPLOYEES[1]]) } };
    const certifications = {
      compliance: (_c: string, employeeId: string) =>
        Promise.resolve({
          compliance: { totalRequired: 2, compliancePercentage: employeeId === 'e1' ? 100 : 50 },
          requiredCerts: [
            { certTypeName: 'Trabajo en altura', derivedStatus: 'VIGENTE' },
            {
              certTypeName: 'Uso de EPP',
              derivedStatus: employeeId === 'e1' ? 'VIGENTE' : 'FALTANTE',
            },
          ],
        }),
    };
    const res = (await makeService(tx, certifications).getMatriz('co', 'u1')) as Any;
    expect(res.columns).toEqual(['Trabajo en altura', 'Uso de EPP']);
    const rows = res.rows as Any[];
    expect(rows).toHaveLength(2);
    expect((rows[0] as Any).cells).toEqual([
      { certTypeName: 'Trabajo en altura', status: 'VIGENTE' },
      { certTypeName: 'Uso de EPP', status: 'VIGENTE' },
    ]);
    expect((rows[1] as Any).compliancePercentage).toBe(50);
    assertNoSalary(res);
  });
});

describe('DisponibilidadService.getAlertas — read view mirroring the cron selection', () => {
  it('certs POR_VENCER/VENCIDA and fixed-term contracts por vencer/vencidos; no salary', async () => {
    let certWhere: Any = {};
    let contractWhere: Any = {};
    const tx = {
      certification: {
        findMany: (a: Any) => {
          certWhere = (a as Any).where;
          return Promise.resolve([
            {
              id: 'c1',
              expiryDate: day(10),
              employee: { id: 'e1', fullName: 'Ana' },
              certificationType: { name: 'Trabajo en altura' },
            },
            {
              id: 'c2',
              expiryDate: day(-3),
              employee: { id: 'e2', fullName: 'Beto' },
              certificationType: { name: 'Uso de EPP' },
            },
          ]);
        },
      },
      employeeContract: {
        findMany: (a: Any) => {
          contractWhere = (a as Any).where;
          return Promise.resolve([
            {
              id: 'k1',
              endDate: day(7),
              contractType: 'PLAZO_FIJO',
              employee: { id: 'e3', fullName: 'Cata' },
            },
          ]);
        },
      },
    };
    const res = (await makeService(tx).getAlertas('co', 'u1')) as Any;
    const certs = res.certifications as Any[];
    expect(certs.find((c) => (c as Any).certificationId === 'c1')!.state).toBe('POR_VENCER');
    expect(certs.find((c) => (c as Any).certificationId === 'c2')!.state).toBe('VENCIDA');
    expect((res.contracts as Any[])[0].state).toBe('POR_VENCER');
    // selection mirrors the cron: VIGENTE certs / principal fixed-term VIGENTE contracts
    expect(certWhere).toMatchObject({ status: 'VIGENTE' });
    expect(contractWhere).toMatchObject({ status: 'VIGENTE', parentContractId: null });
    expect((contractWhere.contractType as Any).in).toEqual(['PLAZO_FIJO', 'POR_OBRA']);
    assertNoSalary(res);
  });
});
