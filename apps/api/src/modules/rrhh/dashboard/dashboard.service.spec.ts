/* HR-006 — proves the dashboard aggregations, the payroll aggregate-only rule,
 * and the per-caller PAYLOAD SCOPING of /overview: the per-person document rows
 * (alertasVencimiento) and the contract-renewal block reach only callers that can
 * read those domains, while worker-domain data + aggregate document counts stay
 * visible. Uses fake Prisma/RLS clients (same style as employees.security.spec.ts).
 * The /overview GATE (read Employee) is unchanged and proven in the CASL specs. */
import { DashboardService, scopeOverviewSections, type OverviewScope } from './dashboard.service';

type Any = Record<string, unknown>;

const BOTH: OverviewScope = { canReadDocuments: true, canReadContracts: true };
const ACCOUNTANT_SHAPED: OverviewScope = { canReadDocuments: false, canReadContracts: false };

function makeService(tx: Any) {
  const prisma = {} as unknown as ConstructorParameters<typeof DashboardService>[0];
  const rls = {
    executeWithRls: (_c: string, _u: string, fn: (t: Any) => unknown) => fn(tx),
  } as unknown as ConstructorParameters<typeof DashboardService>[1];
  return new DashboardService(prisma, rls);
}

function overviewTx() {
  const docCountWheres: Any[] = [];
  const tx = {
    employee: {
      count: (args: Any) => Promise.resolve((args.where as Any).status === 'ACTIVO' ? 7 : 10),
      groupBy: (args: Any) =>
        Promise.resolve(
          (args.by as string[])[0] === 'area'
            ? [
                { area: 'OPERACIONES', _count: { _all: 5 } },
                { area: 'FINANZAS', _count: { _all: 2 } },
              ]
            : [
                { status: 'ACTIVO', _count: { _all: 7 } },
                { status: 'DESVINCULADO', _count: { _all: 3 } },
              ],
        ),
      findMany: () =>
        Promise.resolve([
          { id: 'e1', fullName: 'Ana', area: 'OPERACIONES', status: 'ACTIVO', jobPosition: null },
        ]),
    },
    employeeDocument: {
      count: (args: Any) => {
        docCountWheres.push(args.where);
        return Promise.resolve(2);
      },
      findMany: () =>
        Promise.resolve([
          {
            id: 'd1',
            expiryDate: new Date('2999-01-01'),
            employee: { id: 'e1', fullName: 'Ana' },
            documentType: { id: 't1', name: 'Contrato' },
          },
        ]),
    },
  };
  return { tx, docCountWheres };
}

describe('DashboardService.getOverview — aggregations', () => {
  it('aggregates dotación + documents (excluding REPLACED) and returns honest contract placeholder', async () => {
    const { tx, docCountWheres } = overviewTx();
    const svc = makeService(tx);
    const res = (await svc.getOverview('c1', 'u1', BOTH)) as Any;

    const dotacion = res.dotacion as Any;
    expect(dotacion.activos).toBe(7);
    expect(dotacion.total).toBe(10);
    // porArea sorted desc by count
    expect((dotacion.porArea as Any[])[0]).toEqual({ area: 'OPERACIONES', count: 5 });

    // every expiry-bucket count must exclude REPLACED via APPROVED + supersededById:null
    const expiryWheres = docCountWheres.filter((w) => (w as Any).status === 'APPROVED');
    expect(expiryWheres.length).toBe(3);
    for (const w of expiryWheres) expect((w as Any).supersededById).toBeNull();

    // honest placeholder, not a fabricated number
    expect((res.contratos as Any).available).toBe(false);
    expect((res.contratos as Any).proximasRenovaciones).toEqual([]);
  });
});

describe('DashboardService.getOverview — per-caller payload scoping', () => {
  it('documents-reader (canReadDocuments=true): alertasVencimiento is populated from source', async () => {
    const { tx } = overviewTx();
    const res = (await makeService(tx).getOverview('c1', 'u1', BOTH)) as Any;
    const alerts = res.alertasVencimiento as Any[];
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      documentId: 'd1',
      employeeId: 'e1',
      employeeName: 'Ana',
      documentTypeName: 'Contrato',
    });
  });

  it('ACCOUNTANT-shaped (canReadDocuments=false): alertasVencimiento === [] but worker-domain + aggregate doc counts remain', async () => {
    const { tx } = overviewTx();
    const res = (await makeService(tx).getOverview('c1', 'u1', ACCOUNTANT_SHAPED)) as Any;

    // the cross-surface per-person document rows are gone
    expect(res.alertasVencimiento).toEqual([]);

    // worker-domain data is UNCHANGED (dotación aggregates + recientes roster names)
    expect((res.dotacion as Any).activos).toBe(7);
    expect((res.dotacion as Any).total).toBe(10);
    expect((res.recientes as Any[]).length).toBe(1);
    expect((res.recientes as Any[])[0]).toMatchObject({ id: 'e1', fullName: 'Ana' });

    // aggregate document COUNTS remain (only the per-person rows are scoped out)
    const documentos = res.documentos as Any;
    expect(documentos.vencidos).toBe(2);
    expect(documentos.porVencer).toBe(2);
    expect(documentos.alDia).toBe(2);
    expect(documentos.pendientesRevision).toBe(2);

    // contract block stays empty/unavailable
    expect((res.contratos as Any).available).toBe(false);
    expect((res.contratos as Any).proximasRenovaciones).toEqual([]);
  });

  it('regression: only alertasVencimiento + contratos differ between BOTH and ACCOUNTANT-shaped — every other field is identical', async () => {
    const full = (await makeService(overviewTx().tx).getOverview('c1', 'u1', BOTH)) as Any;
    const scoped = (await makeService(overviewTx().tx).getOverview(
      'c1',
      'u1',
      ACCOUNTANT_SHAPED,
    )) as Any;

    // untouched sections are deep-equal
    expect(scoped.dotacion).toEqual(full.dotacion);
    expect(scoped.documentos).toEqual(full.documentos);
    expect(scoped.recientes).toEqual(full.recientes);

    // only these two are scoped
    expect(full.alertasVencimiento).toHaveLength(1);
    expect(scoped.alertasVencimiento).toEqual([]);
    // contratos is byte-identical today (empty either way) — the gate is future-wiring
    expect(scoped.contratos).toEqual(full.contratos);
  });
});

describe('scopeOverviewSections — pure per-caller scoping', () => {
  const alerts = [{ documentId: 'd1', employeeName: 'Ana' }];
  const emptyContratos = { available: false, proximasRenovaciones: [] as unknown[] };

  it('canReadDocuments=true keeps alertasVencimiento; false empties it', () => {
    expect(
      scopeOverviewSections({ alertasVencimiento: alerts, contratos: emptyContratos }, BOTH)
        .alertasVencimiento,
    ).toEqual(alerts);
    expect(
      scopeOverviewSections(
        { alertasVencimiento: alerts, contratos: emptyContratos },
        { canReadDocuments: false, canReadContracts: true },
      ).alertasVencimiento,
    ).toEqual([]);
  });

  it('canReadContracts=true passes the block through (may populate); false forces empty/unavailable', () => {
    const populated = {
      available: true,
      proximasRenovaciones: [{ contractId: 'c9' }] as unknown[],
    };
    expect(
      scopeOverviewSections({ alertasVencimiento: alerts, contratos: populated }, BOTH).contratos,
    ).toEqual(populated);
    expect(
      scopeOverviewSections(
        { alertasVencimiento: alerts, contratos: populated },
        { canReadDocuments: true, canReadContracts: false },
      ).contratos,
    ).toEqual({ available: false, proximasRenovaciones: [] });
  });

  it('both-false empties both sections (ACCOUNTANT-shaped)', () => {
    const out = scopeOverviewSections(
      {
        alertasVencimiento: alerts,
        contratos: { available: true, proximasRenovaciones: [{ x: 1 }] as unknown[] },
      },
      ACCOUNTANT_SHAPED,
    );
    expect(out.alertasVencimiento).toEqual([]);
    expect(out.contratos).toEqual({ available: false, proximasRenovaciones: [] });
  });
});
