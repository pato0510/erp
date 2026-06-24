/* HR-004a — proves the copy-adapted specificity resolution (employee >
 * jobPosition) and the single-target validation. */
import { EmployeeDocumentRequirementsService } from './employee-document-requirements.service';

type Any = Record<string, unknown>;

function makeService(prisma: Any) {
  const rls = {
    executeWithRls: (_c: string, _u: string, fn: (t: Any) => unknown) => fn(prisma),
  } as unknown as ConstructorParameters<typeof EmployeeDocumentRequirementsService>[1];
  return new EmployeeDocumentRequirementsService(
    prisma as unknown as ConstructorParameters<typeof EmployeeDocumentRequirementsService>[0],
    rls,
  );
}

describe('EmployeeDocumentRequirementsService — specificity employee > jobPosition', () => {
  it('an employee-level requirement wins over a jobPosition-level one for the same type', async () => {
    const prisma = {
      employee: {
        findFirst: () => Promise.resolve({ id: 'emp-1', jobPositionId: 'jp-1' }),
      },
      employeeDocumentRequirement: {
        findMany: () =>
          Promise.resolve([
            {
              id: 'req-pos',
              documentTypeId: 'dt-1',
              employeeId: null,
              jobPositionId: 'jp-1',
              documentType: { id: 'dt-1', name: 'Contrato' },
            },
            {
              id: 'req-emp',
              documentTypeId: 'dt-1',
              employeeId: 'emp-1',
              jobPositionId: null,
              documentType: { id: 'dt-1', name: 'Contrato' },
            },
            {
              id: 'req-pos-only',
              documentTypeId: 'dt-2',
              employeeId: null,
              jobPositionId: 'jp-1',
              documentType: { id: 'dt-2', name: 'EPP' },
            },
          ]),
      },
    };
    const svc = makeService(prisma);
    const res = (await svc.resolveRequirementsForEmployee('company-1', 'emp-1')) as Any[];
    expect(res).toHaveLength(2); // dt-1 deduped to the most specific, dt-2 kept

    const dt1 = res.find((r) => (r as Any).documentTypeId === 'dt-1') as Any;
    expect(dt1.id).toBe('req-emp'); // employee beat jobPosition
    expect(dt1.resolvedFrom).toBe('employee');

    const dt2 = res.find((r) => (r as Any).documentTypeId === 'dt-2') as Any;
    expect(dt2.resolvedFrom).toBe('jobPosition');
  });
});

describe('EmployeeDocumentRequirementsService — single-target validation', () => {
  const prisma = {
    employeeDocumentRequirement: { create: (a: Any) => Promise.resolve(a) },
  };

  it('rejects a payload that sets BOTH employeeId and jobPositionId', async () => {
    const svc = makeService(prisma);
    await expect(
      svc.create('c1', 'u1', {
        employeeId: 'e1',
        jobPositionId: 'jp1',
        documentTypeId: 'dt1',
      } as Any),
    ).rejects.toThrow(/exactamente uno/);
  });

  it('rejects a payload that sets NEITHER target', async () => {
    const svc = makeService(prisma);
    await expect(svc.create('c1', 'u1', { documentTypeId: 'dt1' } as Any)).rejects.toThrow(
      /exactamente uno/,
    );
  });
});
