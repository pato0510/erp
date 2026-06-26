/* HR-014 — proves the certification status-from-expiry derivation and the
 * compliance algorithm reading the cargo requiredCertTypes (HR-002). Copy-adapt
 * of the HR-004 compliance test style. Fake Prisma/RLS clients. */
import { CertificationsService } from './certifications.service';

type Any = Record<string, unknown>;
const day = (offset: number) => new Date(Date.now() + offset * 86400000);

function makeService(prisma: Any, tx: Any = {}) {
  const rls = {
    executeWithRls: (_c: string, _u: string, fn: (t: Any) => unknown) => fn(tx),
  } as unknown as ConstructorParameters<typeof CertificationsService>[1];
  return new CertificationsService(
    prisma as unknown as ConstructorParameters<typeof CertificationsService>[0],
    rls,
  );
}

const cert = (over: Partial<Any> = {}) => ({
  id: 'c1',
  status: 'VIGENTE',
  expiryDate: day(200),
  category: 'CERTIFICACION',
  certificationType: {
    id: 't1',
    name: 'Trabajo en altura',
    category: 'CERTIFICACION',
    issuingEntity: null,
  },
  document: null,
  ...over,
});

describe('CertificationsService.findAll — derived status from expiry', () => {
  function svcWith(rows: Any[]) {
    return makeService({ certification: { findMany: () => Promise.resolve(rows) } });
  }

  it('expiry far out → VIGENTE; within 30d → POR_VENCER; past → VENCIDA; ANULADA wins', async () => {
    const rows = [
      cert({ id: 'a', expiryDate: day(200) }),
      cert({ id: 'b', expiryDate: day(10) }),
      cert({ id: 'c', expiryDate: day(-5) }),
      cert({ id: 'd', status: 'ANULADA', expiryDate: day(200) }),
      cert({ id: 'e', expiryDate: null }), // no expiry → VIGENTE
    ];
    const res = (await svcWith(rows).findAll('co', 'emp')) as Any[];
    const byId = Object.fromEntries(res.map((r) => [(r as Any).id, (r as Any).derivedStatus]));
    expect(byId.a).toBe('VIGENTE');
    expect(byId.b).toBe('POR_VENCER');
    expect(byId.c).toBe('VENCIDA');
    expect(byId.d).toBe('ANULADA');
    expect(byId.e).toBe('VIGENTE');
  });

  it('expiring TODAY → POR_VENCER, not VENCIDA (day-based, start-of-day fold)', async () => {
    const res = (await svcWith([cert({ id: 'today', expiryDate: day(0) })]).findAll(
      'co',
      'emp',
    )) as Any[];
    expect((res[0] as Any).derivedStatus).toBe('POR_VENCER');
  });

  it('exactly 30 days out → POR_VENCER; exactly 31 → VIGENTE (window not a day too wide)', async () => {
    const r30 = (await svcWith([cert({ id: 'a', expiryDate: day(30) })]).findAll(
      'co',
      'emp',
    )) as Any[];
    const r31 = (await svcWith([cert({ id: 'b', expiryDate: day(31) })]).findAll(
      'co',
      'emp',
    )) as Any[];
    expect((r30[0] as Any).derivedStatus).toBe('POR_VENCER');
    expect((r31[0] as Any).derivedStatus).toBe('VIGENTE');
  });

  it('status filter is applied to the DERIVED status (POR_VENCER not persisted)', async () => {
    const rows = [cert({ id: 'a', expiryDate: day(200) }), cert({ id: 'b', expiryDate: day(10) })];
    const res = (await svcWith(rows).findAll('co', 'emp', { status: 'POR_VENCER' })) as Any[];
    expect(res.map((r) => (r as Any).id)).toEqual(['b']);
  });
});

describe('CertificationsService.compliance — reads cargo requiredCertTypes', () => {
  it('required-vs-present: held VIGENTE counts, VENCIDA/missing are gaps, extra certs are additional', async () => {
    const prisma = {
      employee: {
        findFirst: () =>
          Promise.resolve({
            id: 'emp',
            fullName: 'Ana',
            jobPosition: {
              id: 'jp',
              name: 'Operador',
              requiredCertTypes: ['Trabajo en altura', 'Manejo a la defensiva', 'Uso de EPP'],
            },
          }),
      },
      certification: {
        findMany: () =>
          Promise.resolve([
            // held VIGENTE for "Trabajo en altura" → valid
            cert({
              id: 'h1',
              expiryDate: day(200),
              certificationType: {
                id: 't1',
                name: 'Trabajo en altura',
                category: 'CERTIFICACION',
                issuingEntity: null,
              },
            }),
            // held but VENCIDA for "Manejo a la defensiva" → expired gap
            cert({
              id: 'h2',
              expiryDate: day(-10),
              certificationType: {
                id: 't2',
                name: 'Manejo a la defensiva',
                category: 'CERTIFICACION',
                issuingEntity: null,
              },
            }),
            // an extra cert NOT in the required list → additional
            cert({
              id: 'h3',
              expiryDate: day(100),
              certificationType: {
                id: 't9',
                name: 'Primeros auxilios',
                category: 'CERTIFICACION',
                issuingEntity: null,
              },
            }),
            // "Uso de EPP" not held → missing
          ]),
      },
    };
    const res = (await makeService(prisma).compliance('co', 'emp')) as Any;
    const c = res.compliance as Any;
    expect(c.totalRequired).toBe(3);
    expect(c.valid).toBe(1); // Trabajo en altura
    expect(c.expired).toBe(1); // Manejo a la defensiva (VENCIDA)
    expect(c.missing).toBe(1); // Uso de EPP
    // percentage = (valid + expiringSoon) / totalRequired
    expect(c.compliancePercentage).toBe(Math.round((1 / 3) * 1000) / 10);

    const required = res.requiredCerts as Any[];
    expect(
      required.find((r) => (r as Any).certTypeName === 'Trabajo en altura')!.derivedStatus,
    ).toBe('VIGENTE');
    expect(
      required.find((r) => (r as Any).certTypeName === 'Manejo a la defensiva')!.derivedStatus,
    ).toBe('VENCIDA');
    expect(required.find((r) => (r as Any).certTypeName === 'Uso de EPP')!.derivedStatus).toBe(
      'FALTANTE',
    );
    // case-insensitive name match works (extra cert surfaced separately)
    expect((res.additionalCerts as Any[]).map((c) => (c as Any).id)).toEqual(['h3']);
  });

  it('no cargo / no required certs → 100% compliance, no gaps', async () => {
    const prisma = {
      employee: {
        findFirst: () => Promise.resolve({ id: 'emp', fullName: 'Ana', jobPosition: null }),
      },
      certification: { findMany: () => Promise.resolve([]) },
    };
    const res = (await makeService(prisma).compliance('co', 'emp')) as Any;
    expect((res.compliance as Any).totalRequired).toBe(0);
    expect((res.compliance as Any).compliancePercentage).toBe(100);
  });
});

describe('CertificationsService.create — category denormalised + auto-expiry', () => {
  it('derives category from the type and auto-expiry from defaultValidityDays', async () => {
    let captured: Any = {};
    const prisma = {
      employee: { findFirst: () => Promise.resolve({ id: 'emp' }) },
      certificationType: {
        findFirst: () =>
          Promise.resolve({
            id: 't1',
            category: 'HABILITACION_FAENA',
            requiresExpiry: true,
            defaultValidityDays: 365,
          }),
      },
    };
    const tx = {
      certification: {
        create: (args: Any) => {
          captured = args;
          return Promise.resolve({ id: 'c1', ...(args.data as Any) });
        },
      },
    };
    await makeService(prisma, tx).create('co', 'u1', {
      employeeId: 'emp',
      certificationTypeId: 't1',
      issueDate: '2026-01-01',
    } as Any);
    const data = captured.data as Any;
    expect(data.category).toBe('HABILITACION_FAENA'); // from the type
    expect(data.status).toBe('VIGENTE');
    // 2026-01-01 + 365 days → 2027-01-01
    expect((data.expiryDate as Date).toISOString().slice(0, 10)).toBe('2027-01-01');
  });
});
