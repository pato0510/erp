/* HR-012 — proves the unified absence flow + the SOFT availability marker with
 * fake Prisma/RLS clients. The service imports ONLY Prisma + Rls (no Operations
 * dependency) — availability reads the absences table and nothing else. */
import { AbsencesService } from './absences.service';

type Any = Record<string, unknown>;

function makeService(prisma: Any, tx: Any = {}) {
  const rls = {
    executeWithRls: (_c: string, _u: string, fn: (t: Any) => unknown) => fn(tx),
  } as unknown as ConstructorParameters<typeof AbsencesService>[1];
  return new AbsencesService(
    prisma as unknown as ConstructorParameters<typeof AbsencesService>[0],
    rls,
  );
}

describe('AbsencesService.create', () => {
  it('permiso: pre-fills días/withPay from the type default, status PENDIENTE', async () => {
    let captured: Any = {};
    const prisma = {
      employee: { findFirst: () => Promise.resolve({ id: 'e1' }) },
      absenceType: {
        findFirst: () =>
          Promise.resolve({ id: 't1', daysDefault: 5, withPay: true, category: 'PERMISO' }),
      },
    };
    const tx = {
      absence: {
        create: (args: Any) => {
          captured = args;
          return Promise.resolve({ id: 'a1', ...(args.data as Any) });
        },
      },
    };
    const svc = makeService(prisma, tx);
    await svc.create('c1', 'u1', {
      employeeId: 'e1',
      category: 'PERMISO',
      absenceTypeId: 't1',
      startDate: '2025-06-02',
      endDate: '2025-06-06',
    } as Any);
    const data = captured.data as Any;
    expect(data.dias).toBe(5); // from type default
    expect(data.withPay).toBe(true);
    expect(data.status).toBe('PENDIENTE');
    expect(data.approvedBy).toBeNull();
    expect(data.requestedBy).toBe('u1');
  });

  it('licencia: registered directly APROBADO with folio/entidad sets approvedBy', async () => {
    let captured: Any = {};
    const prisma = { employee: { findFirst: () => Promise.resolve({ id: 'e1' }) } };
    const tx = {
      absence: {
        create: (args: Any) => {
          captured = args;
          return Promise.resolve({ id: 'a2', ...(args.data as Any) });
        },
      },
    };
    const svc = makeService(prisma, tx);
    await svc.create('c1', 'u1', {
      employeeId: 'e1',
      category: 'LICENCIA',
      startDate: '2025-06-02',
      endDate: '2025-06-10',
      dias: 9,
      status: 'APROBADO',
      medicalFolio: 'F-12345',
      healthEntity: 'Fonasa',
    } as Any);
    const data = captured.data as Any;
    expect(data.category).toBe('LICENCIA');
    expect(data.status).toBe('APROBADO');
    expect(data.approvedBy).toBe('u1');
    expect(data.medicalFolio).toBe('F-12345');
    expect(data.healthEntity).toBe('Fonasa');
    expect(data.dias).toBe(9);
  });

  it('rejects endDate before startDate', async () => {
    const prisma = { employee: { findFirst: () => Promise.resolve({ id: 'e1' }) } };
    const svc = makeService(prisma);
    await expect(
      svc.create('c1', 'u1', {
        employeeId: 'e1',
        category: 'PERMISO',
        startDate: '2025-06-10',
        endDate: '2025-06-02',
      } as Any),
    ).rejects.toThrow(/no puede ser anterior/);
  });
});

describe('AbsencesService.getAvailability — SOFT marker (no Operations)', () => {
  it('not available when an APROBADO blocking absence covers the date', async () => {
    let where: Any = {};
    const prisma = {
      employee: { findFirst: () => Promise.resolve({ id: 'e1' }) },
      absence: {
        findFirst: (args: Any) => {
          where = args.where as Any;
          return Promise.resolve({ id: 'b1', category: 'LICENCIA', status: 'APROBADO' });
        },
      },
    };
    const svc = makeService(prisma);
    const res = (await svc.getAvailability('c1', 'e1', '2025-06-03')) as Any;
    expect(res.available).toBe(false);
    expect((res.blockingAbsence as Any).id).toBe('b1');
    // the query only considers APROBADO + blocksAvailability covering the date
    expect(where.status).toBe('APROBADO');
    expect(where.blocksAvailability).toBe(true);
  });

  it('available when no blocking absence covers the date', async () => {
    const prisma = {
      employee: { findFirst: () => Promise.resolve({ id: 'e1' }) },
      absence: { findFirst: () => Promise.resolve(null) },
    };
    const svc = makeService(prisma);
    const res = (await svc.getAvailability('c1', 'e1')) as Any;
    expect(res.available).toBe(true);
    expect(res.blockingAbsence).toBeNull();
  });
});

describe('AbsencesService — workflow guards', () => {
  it('approve rejects a non-PENDIENTE absence', async () => {
    const prisma = {
      absence: { findFirst: () => Promise.resolve({ id: 'a1', status: 'APROBADO' }) },
    };
    const svc = makeService(prisma);
    await expect(svc.approve('a1', 'c1', 'u1')).rejects.toThrow(/PENDIENTES/);
  });

  it('cancel rejects a finalised (RECHAZADO) absence', async () => {
    const prisma = {
      absence: { findFirst: () => Promise.resolve({ id: 'a1', status: 'RECHAZADO' }) },
    };
    const svc = makeService(prisma);
    await expect(svc.cancel('a1', 'c1', 'u1')).rejects.toThrow(/PENDIENTES o APROBADAS/);
  });
});
