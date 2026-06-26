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
