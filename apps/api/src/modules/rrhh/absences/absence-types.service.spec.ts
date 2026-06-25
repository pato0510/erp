/* HR-012 — proves the seed creates the 8 Chilean legal permit types. */
import { AbsenceTypesService } from './absence-types.service';

type Any = Record<string, unknown>;

describe('AbsenceTypesService.seedRecommended', () => {
  it('seeds the 8 Chilean legal permit types (idempotent via skipDuplicates)', async () => {
    let createManyArgs: Any = {};
    const tx = {
      absenceType: {
        createMany: (args: Any) => {
          createManyArgs = args;
          return Promise.resolve({ count: 8 });
        },
      },
    };
    const prisma = {
      absenceType: { findMany: () => Promise.resolve([]) },
    } as unknown as ConstructorParameters<typeof AbsenceTypesService>[0];
    const rls = {
      executeWithRls: (_c: string, _u: string, fn: (t: Any) => unknown) => fn(tx),
    } as unknown as ConstructorParameters<typeof AbsenceTypesService>[1];

    const svc = new AbsenceTypesService(prisma, rls);
    const res = (await svc.seedRecommended('c1', 'u1')) as Any;

    const data = createManyArgs.data as Any[];
    expect(data).toHaveLength(8);
    expect(createManyArgs.skipDuplicates).toBe(true);
    expect(res.created).toBe(8);
    expect(res.total).toBe(8);
    // spot-check a couple of the certified entries
    const matrimonio = data.find((t) => (t as Any).name === 'Matrimonio / AUC') as Any;
    expect(matrimonio).toMatchObject({
      daysDefault: 5,
      unit: 'HABILES',
      withPay: true,
      isLegal: true,
    });
    const sinGoce = data.find((t) => (t as Any).name === 'Permiso administrativo sin goce') as Any;
    expect(sinGoce).toMatchObject({ daysDefault: null, withPay: false, isLegal: false });
  });
});
