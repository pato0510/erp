/* HR-003 — proves THE SECURITY CRUX at the query level: the employee list and
 * ficha queries never request the `compensation` relation, so salary/bank can
 * never appear in those payloads. Uses fake Prisma clients to capture the exact
 * args the service passes. */
import { EmployeesService } from './employees.service';

const SALARY_FIELDS = [
  'baseSalaryGross',
  'afp',
  'health',
  'bank',
  'bankAccount',
  'bankAccountType',
];

describe('EmployeesService — compensation never leaks into list/ficha', () => {
  let captured: { method: string; args: Record<string, unknown> }[];
  let svc: EmployeesService;

  beforeEach(() => {
    captured = [];
    const prisma = {
      employee: {
        findMany: (args: Record<string, unknown>) => {
          captured.push({ method: 'findMany', args });
          return Promise.resolve([]);
        },
        findFirst: (args: Record<string, unknown>) => {
          captured.push({ method: 'findFirst', args });
          return Promise.resolve({ id: 'emp-1' });
        },
      },
    } as unknown as ConstructorParameters<typeof EmployeesService>[0];
    const rls = {} as unknown as ConstructorParameters<typeof EmployeesService>[1];
    svc = new EmployeesService(prisma, rls);
  });

  it('findAll uses a select with NO compensation relation and NO salary/bank fields', async () => {
    await svc.findAll('company-1');
    const call = captured.find((c) => c.method === 'findMany');
    const select = call?.args.select as Record<string, unknown>;
    expect(select).toBeDefined();
    expect(select.compensation).toBeUndefined();
    for (const f of SALARY_FIELDS) expect(select[f]).toBeUndefined();
  });

  it('findOne includes only jobPosition/supervisor/user — NEVER compensation', async () => {
    await svc.findOne('emp-1', 'company-1');
    const call = captured.find((c) => c.method === 'findFirst');
    const include = call?.args.include as Record<string, unknown>;
    expect(include).toBeDefined();
    expect(include.compensation).toBeUndefined();
    expect(Object.keys(include).sort()).toEqual(['jobPosition', 'supervisor', 'user']);
  });

  it('create rejects an invalid Módulo-11 RUT before any DB/RLS write', async () => {
    const dto = {
      fullName: 'Juan Pérez',
      rut: '12.345.678-9', // wrong DV (real DV is 5)
      area: 'OPERACIONES',
      hireDate: '2026-01-01',
    } as unknown as Parameters<EmployeesService['create']>[2];
    // normalizeRut throws BadRequestException as the first line of create(),
    // before the fake rls/prisma is touched — so a rejection proves the gate.
    await expect(svc.create('company-1', 'user-1', dto)).rejects.toThrow(/RUT inválido/);
  });
});
