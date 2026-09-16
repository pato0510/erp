/* COM-018 — proves the enterprise rules: RUT normalized (cleanRut) + Módulo-11 validated
 * (400); duplicate name (case-insensitive) → 409 and duplicate RUT → 409 from the
 * pre-check, and P2002 from the DB indexes → 409 as the race backstop; createdBy from
 * the JWT, never input; foreign/missing → 404 on update; deactivation is a plain
 * isActive=false update that never touches accounts; list scoping (active only unless
 * includeInactive, name/rut search). Stateful fake Prisma/RLS (same style as the
 * opportunity-notes/documents specs). */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EnterprisesService } from './enterprises.service';

type Any = Record<string, unknown>;

function makeService(seed: Any[] = [], opts: { createThrowsP2002?: string } = {}) {
  const rows: Any[] = [...seed];
  let seq = 1;
  const matches = (e: Any, w: Any) => {
    if (w.id !== undefined) {
      if (typeof w.id === 'object' && w.id && 'not' in (w.id as Any)) {
        if (e.id === (w.id as Any).not) return false;
      } else if (e.id !== w.id) return false;
    }
    if (w.companyId !== undefined && e.companyId !== w.companyId) return false;
    if (w.isActive !== undefined && e.isActive !== w.isActive) return false;
    if (w.name !== undefined) {
      const n = w.name as Any;
      if (n.equals !== undefined) {
        const a = String(e.name),
          b = String(n.equals);
        if (n.mode === 'insensitive' ? a.toLowerCase() !== b.toLowerCase() : a !== b) return false;
      }
    }
    if (w.rut !== undefined && typeof w.rut === 'string' && e.rut !== w.rut) return false;
    if (w.OR !== undefined) {
      const ors = w.OR as Any[];
      const hit = ors.some((c) => {
        if (c.name)
          return String(e.name)
            .toLowerCase()
            .includes(String((c.name as Any).contains).toLowerCase());
        if (c.rut) return String(e.rut ?? '').includes(String((c.rut as Any).contains));
        return false;
      });
      if (!hit) return false;
    }
    return true;
  };
  const enterprise = {
    findFirst: jest.fn((args: Any) =>
      Promise.resolve(rows.find((e) => matches(e, args.where as Any)) ?? null),
    ),
    findMany: jest.fn((args: Any) =>
      Promise.resolve(
        rows
          .filter((e) => matches(e, (args.where as Any) ?? {}))
          .sort((a, b) => String(a.name).localeCompare(String(b.name))),
      ),
    ),
    create: jest.fn((args: Any) => {
      if (opts.createThrowsP2002) {
        throw new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: opts.createThrowsP2002 },
        });
      }
      const row = { id: `e${seq++}`, isActive: true, ...(args.data as Any) };
      rows.push(row);
      return Promise.resolve(row);
    }),
    update: jest.fn((args: Any) => {
      const row = rows.find((e) => e.id === (args.where as Any).id) as Any;
      Object.assign(row, args.data);
      return Promise.resolve(row);
    }),
  };
  const account = { update: jest.fn(), updateMany: jest.fn() };
  const prisma = { enterprise, account } as unknown as ConstructorParameters<
    typeof EnterprisesService
  >[0];
  const rls = {
    executeWithRls: (_c: string, _u: string, fn: (t: unknown) => unknown) => fn(prisma),
  } as unknown as ConstructorParameters<typeof EnterprisesService>[1];
  return { svc: new EnterprisesService(prisma, rls), rows, enterprise, account };
}

const minera = {
  id: 'e-minera',
  companyId: 'c1',
  name: 'Minera Los Andes',
  rut: '123456785',
  isActive: true,
};
const foreign = { id: 'e-x', companyId: 'OTHER', name: 'Ajena', rut: null, isActive: true };

describe('EnterprisesService — create', () => {
  it('sets createdBy from the JWT user, NEVER from input; trims the name', async () => {
    const { svc } = makeService();
    const row = (await svc.create('c1', 'u1', {
      name: '  Constructora Sur  ',
      createdBy: 'attacker',
    } as never)) as Any;
    expect(row.createdBy).toBe('u1');
    expect(row.companyId).toBe('c1');
    expect(row.name).toBe('Constructora Sur');
    expect(row.rut).toBeNull();
  });

  it('normalizes a formatted RUT to its canonical form', async () => {
    const { svc } = makeService();
    const row = (await svc.create('c1', 'u1', { name: 'X', rut: '12.345.678-5' })) as Any;
    expect(row.rut).toBe('123456785');
  });

  it('rejects an invalid RUT (bad check digit) with 400, no write', async () => {
    const { svc, enterprise } = makeService();
    await expect(svc.create('c1', 'u1', { name: 'X', rut: '12.345.678-9' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(enterprise.create).not.toHaveBeenCalled();
  });

  it('treats an empty RUT as null', async () => {
    const { svc } = makeService();
    const row = (await svc.create('c1', 'u1', { name: 'X', rut: '   ' })) as Any;
    expect(row.rut).toBeNull();
  });

  it('rejects an empty name with 400', async () => {
    const { svc } = makeService();
    await expect(svc.create('c1', 'u1', { name: '   ' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('duplicate name (case-insensitive) in the company → 409, no write', async () => {
    const { svc, enterprise } = makeService([{ ...minera }]);
    await expect(svc.create('c1', 'u1', { name: 'minera los andes' })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(enterprise.create).not.toHaveBeenCalled();
  });

  it('same name in ANOTHER company is fine (company-scoped uniqueness)', async () => {
    const { svc } = makeService([{ ...minera }]);
    const row = (await svc.create('OTHER', 'u1', { name: 'Minera Los Andes' })) as Any;
    expect(row.companyId).toBe('OTHER');
  });

  it('duplicate RUT in the company → 409, no write', async () => {
    const { svc, enterprise } = makeService([{ ...minera }]);
    await expect(
      svc.create('c1', 'u1', { name: 'Otra', rut: '12.345.678-5' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(enterprise.create).not.toHaveBeenCalled();
  });

  it('P2002 from the DB unique index (race backstop) → 409', async () => {
    const { svc } = makeService([], { createThrowsP2002: 'enterprises_companyId_rut_key' });
    await expect(svc.create('c1', 'u1', { name: 'X', rut: '11.111.111-1' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe('EnterprisesService — update', () => {
  it('foreign / missing → 404, no write', async () => {
    const { svc, enterprise } = makeService([{ ...foreign }]);
    await expect(svc.update('e-x', 'c1', 'u1', { name: 'Y' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(svc.update('nope', 'c1', 'u1', { name: 'Y' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(enterprise.update).not.toHaveBeenCalled();
  });

  it('renaming to another enterprise’s name (any case) → 409; keeping its own name is fine', async () => {
    const other = {
      id: 'e-2',
      companyId: 'c1',
      name: 'Constructora Sur',
      rut: null,
      isActive: true,
    };
    const { svc } = makeService([{ ...minera }, other]);
    await expect(
      svc.update('e-2', 'c1', 'u1', { name: 'MINERA LOS ANDES' }),
    ).rejects.toBeInstanceOf(ConflictException);
    const row = (await svc.update('e-2', 'c1', 'u1', { name: 'constructora sur' })) as Any;
    expect(row.name).toBe('constructora sur');
  });

  it('rut: validated + normalized on update; empty clears it', async () => {
    const { svc } = makeService([{ ...minera }]);
    await expect(svc.update('e-minera', 'c1', 'u1', { rut: '1-1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const row = (await svc.update('e-minera', 'c1', 'u1', { rut: '' })) as Any;
    expect(row.rut).toBeNull();
  });

  it('deactivation is isActive=false and never touches accounts (links kept)', async () => {
    const { svc, rows, account, enterprise } = makeService([{ ...minera }]);
    const row = (await svc.update('e-minera', 'c1', 'u1', { isActive: false })) as Any;
    expect(row.isActive).toBe(false);
    expect(rows).toHaveLength(1);
    expect(account.update).not.toHaveBeenCalled();
    expect(account.updateMany).not.toHaveBeenCalled();
    expect(enterprise.update).toHaveBeenCalledWith({
      where: { id: 'e-minera' },
      data: { isActive: false },
    });
  });
});

describe('EnterprisesService — list', () => {
  const rows = [
    { ...minera },
    { id: 'e-b', companyId: 'c1', name: 'Agrícola Norte', rut: null, isActive: false },
    { id: 'e-c', companyId: 'c1', name: 'Zeta Ltda', rut: '111111111', isActive: true },
    { ...foreign },
  ];

  it('active only by default, ordered by name, company-scoped', async () => {
    const { svc } = makeService(rows);
    const list = (await svc.findAll('c1')) as Any[];
    expect(list.map((e) => e.id)).toEqual(['e-minera', 'e-c']);
  });

  it('includeInactive brings the inactive ones', async () => {
    const { svc } = makeService(rows);
    const list = (await svc.findAll('c1', { includeInactive: true })) as Any[];
    expect(list.map((e) => e.id)).toEqual(['e-b', 'e-minera', 'e-c']);
  });

  it('q matches the name or the normalized RUT', async () => {
    const { svc } = makeService(rows);
    expect(((await svc.findAll('c1', { q: 'zeta' })) as Any[]).map((e) => e.id)).toEqual(['e-c']);
    expect(((await svc.findAll('c1', { q: '11.111.111' })) as Any[]).map((e) => e.id)).toEqual([
      'e-c',
    ]);
  });
});
