/* HR-007 — proves the contract invariants with fake Prisma/RLS clients:
 *   - PLAZO_FIJO/POR_OBRA without endDate is rejected
 *   - creating a principal VIGENTE supersedes the prior principal (atomic)
 *   - an anexo (parentContractId set) is EXEMPT from the supersede rule
 */
import { EmployeeContractsService } from './employee-contracts.service';

type Any = Record<string, unknown>;

function makeService(prisma: Any, tx: Any) {
  const rls = {
    executeWithRls: (_c: string, _u: string, fn: (t: Any) => unknown) => fn(tx),
  } as unknown as ConstructorParameters<typeof EmployeeContractsService>[1];
  return new EmployeeContractsService(
    prisma as unknown as ConstructorParameters<typeof EmployeeContractsService>[0],
    rls,
  );
}

const base = {
  employeeId: 'e1',
  startDate: '2026-01-01',
  workSchedule: 'COMPLETA',
  baseSalary: 1_000_000,
};

describe('EmployeeContractsService.create', () => {
  it('rejects PLAZO_FIJO without endDate (before touching the DB)', async () => {
    const svc = makeService({}, {});
    await expect(
      svc.create('c1', 'u1', { ...base, contractType: 'PLAZO_FIJO' } as Any),
    ).rejects.toThrow(/PLAZO_FIJO o POR_OBRA requieren fecha/);
  });

  it('creating a principal VIGENTE supersedes the prior principal VIGENTE atomically', async () => {
    const calls: { op: string; args: Any }[] = [];
    const tx = {
      employeeContract: {
        updateMany: (args: Any) => {
          calls.push({ op: 'updateMany', args });
          return Promise.resolve({ count: 1 });
        },
        create: (args: Any) => {
          calls.push({ op: 'create', args });
          return Promise.resolve({ id: 'new', ...(args.data as Any) });
        },
      },
    };
    const prisma = { employee: { findFirst: () => Promise.resolve({ id: 'e1' }) } };
    const svc = makeService(prisma, tx);

    await svc.create('c1', 'u1', { ...base, contractType: 'INDEFINIDO' } as Any);

    const um = calls.find((c) => c.op === 'updateMany');
    expect(um).toBeDefined();
    expect(um!.args.where).toMatchObject({
      employeeId: 'e1',
      parentContractId: null,
      status: 'VIGENTE',
    });
    expect((um!.args.data as Any).status).toBe('REEMPLAZADO');
    // supersede happens before the insert
    expect(calls.map((c) => c.op)).toEqual(['updateMany', 'create']);
  });

  it('an anexo (parentContractId set) is EXEMPT from the supersede rule', async () => {
    const ops: string[] = [];
    const tx = {
      employeeContract: {
        updateMany: () => {
          ops.push('updateMany');
          return Promise.resolve({ count: 0 });
        },
        create: () => {
          ops.push('create');
          return Promise.resolve({ id: 'anexo' });
        },
      },
    };
    const prisma = {
      employee: { findFirst: () => Promise.resolve({ id: 'e1' }) },
      employeeContract: { findFirst: () => Promise.resolve({ id: 'p1', parentContractId: null }) },
    };
    const svc = makeService(prisma, tx);

    await svc.create('c1', 'u1', {
      ...base,
      contractType: 'INDEFINIDO',
      parentContractId: 'p1',
    } as Any);

    expect(ops).toContain('create');
    expect(ops).not.toContain('updateMany'); // no principal supersede for an anexo
  });
});
