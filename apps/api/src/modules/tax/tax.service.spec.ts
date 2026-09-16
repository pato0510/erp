import { DocumentDirection } from '@prisma/client';
import { TaxService } from './tax.service';
import { BaseApiSiiProvider } from './providers/baseapi/baseapi-sii.provider';
import { SiiProviderFactory } from './providers/sii-provider.factory';
import { PrismaService } from '../common/prisma/prisma.service';
import { RlsService } from '../common/rls/rls.service';
import { CategoryRulesService } from '../catalogs/category-rules.service';
import { readCounterpartyGiro } from './counterparty-giro';

type DocumentRow = {
  id: string;
  companyId: string;
  type: string;
  folio: number;
  direction: DocumentDirection;
  issueDate: Date;
  movementId: string | null;
  issuerRut: string;
  receiverRut: string;
  metadata: { raw: Record<string, unknown> };
};
type PartyRow = {
  id: string;
  companyId: string;
  taxId: string;
  giro: string | null;
  type: string;
  name: string;
};
type MovementRow = {
  id: string;
  companyId: string;
  counterpartyId: string;
  categoryId: string;
  source: string;
};
type RuleRow = {
  id?: string;
  ruleType: string;
  matchValue: string | null;
  categoryId: string;
};
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing test record');
  return value;
}
const companyId = 'company-a';
const userId = 'user-a';
const periodId = 'period-a';
const source = {
  'Tipo Doc': 33,
  Folio: 1,
  'RUT Proveedor': '12.345.678-5',
  'Razón Social': 'Horizonte Ltda.',
  'Fecha Docto': '15/09/2026',
  'Monto total': 11900,
  GiroEmis: 'Construcción industrial',
};

// The real provider parser and matcher run against a transactional persistence
// double. Rollback snapshots test the separate document/movement boundary.
function setup() {
  let documents: DocumentRow[] = [];
  let counterparties: PartyRow[] = [];
  let movements: MovementRow[] = [];
  let rules: RuleRow[] = [
    {
      id: 'rule-rut',
      ruleType: 'RUT',
      matchValue: '123456785',
      categoryId: 'rut-category',
    },
  ];
  let scope = 0;
  const writes: { entity: string; scope: number }[] = [];
  const tx = {
    taxSyncRun: { create: jest.fn().mockResolvedValue({ id: 'sync' }), update: jest.fn() },
    category: { upsert: jest.fn(({ create }) => ({ ...create, id: create.name })) },
    categoryRule: { findMany: jest.fn(async () => rules) },
    taxDocument: {
      findUnique: jest.fn(
        async ({ where }) =>
          documents.find((d) =>
            where.id
              ? d.id === where.id
              : d.companyId === where.companyId_type_folio_direction.companyId &&
                d.type === where.companyId_type_folio_direction.type &&
                d.folio === where.companyId_type_folio_direction.folio &&
                d.direction === where.companyId_type_folio_direction.direction,
          ) ?? null,
      ),
      findMany: jest.fn(async ({ where, take, cursor }) => {
        const sorted = documents
          .filter((d) => d.companyId === where.companyId && d.movementId)
          .sort(
            (a, b) => b.issueDate.getTime() - a.issueDate.getTime() || b.id.localeCompare(a.id),
          );
        const start = cursor ? sorted.findIndex((d) => d.id === cursor.id) + 1 : 0;
        return sorted.slice(start, start + take);
      }),
      create: jest.fn(async ({ data }) => {
        const doc = { ...data, id: `doc-${documents.length}`, movementId: null };
        documents.push(doc);
        writes.push({ entity: 'document', scope });
        return doc;
      }),
      update: jest.fn(async ({ where, data }) => {
        const doc = required(documents.find((d) => d.id === where.id));
        Object.assign(doc, data);
        writes.push({ entity: data.movementId ? 'link' : 'document', scope });
        return doc;
      }),
    },
    counterparty: {
      findUnique: jest.fn(
        async ({ where }) =>
          counterparties.find(
            (c) =>
              c.companyId === where.companyId_taxId.companyId &&
              c.taxId === where.companyId_taxId.taxId,
          ) ?? null,
      ),
      findUniqueOrThrow: jest.fn(async ({ where }) =>
        required(counterparties.find((c) => c.id === where.id)),
      ),
      create: jest.fn(async ({ data }) => {
        const c = { ...data, id: `cp-${counterparties.length}` };
        counterparties.push(c);
        return c;
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        const c = counterparties.find(
          (c) => c.id === where.id && c.companyId === where.companyId && c.giro === null,
        );
        if (!c) return { count: 0 };
        Object.assign(c, data);
        return { count: 1 };
      }),
    },
    movement: {
      create: jest.fn(async ({ data }) => {
        const m = { ...data, id: `m-${movements.length}` };
        movements.push(m);
        writes.push({ entity: 'movement', scope });
        return m;
      }),
      findFirst: jest.fn(async ({ where }) => {
        const m = movements.find((m) => m.id === where.id && m.companyId === where.companyId);
        return m
          ? { ...m, counterparty: counterparties.find((c) => c.id === m.counterpartyId) }
          : null;
      }),
    },
  };
  const rls = {
    executeWithRls: jest.fn(async (company, user, fn) => {
      expect([company, user]).toEqual([companyId, userId]);
      const previous = structuredClone({ documents, counterparties, movements });
      scope++;
      try {
        return await fn(tx);
      } catch (err) {
        ({ documents, counterparties, movements } = previous);
        throw err;
      }
    }),
  };
  const prisma = {
    fiscalPeriod: {
      findFirst: jest.fn().mockResolvedValue({ id: periodId, year: 2026, month: 9 }),
    },
  };
  const matcher = new CategoryRulesService(
    prisma as unknown as PrismaService,
    rls as unknown as RlsService,
  );
  const tax = new TaxService(
    prisma as unknown as PrismaService,
    { getProvider: () => new BaseApiSiiProvider() } as unknown as SiiProviderFactory,
    matcher,
    rls as unknown as RlsService,
  );
  return {
    tx,
    tax,
    rls,
    writes,
    matcher,
    setRules: (value: RuleRow[]) => {
      rules = value;
    },
    state: () => ({ documents, counterparties, movements }),
    sync: (direction = DocumentDirection.RECIBIDO) =>
      tax.syncDocuments(companyId, userId, periodId, direction),
  };
}

describe('FIN-A SII source facts and categorization', () => {
  const env = {
    BASEAPI_KEY: process.env.BASEAPI_KEY,
    SII_RUT: process.env.SII_RUT,
    SII_PASSWORD: process.env.SII_PASSWORD,
  };
  let fetchMock: jest.SpyInstance;
  beforeEach(() => {
    process.env.BASEAPI_KEY = 'fixture-key';
    process.env.SII_RUT = '11.111.111-1';
    process.env.SII_PASSWORD = 'fixture-password';
    fetchMock = jest.spyOn(global, 'fetch').mockImplementation(
      async () =>
        ({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ success: true, data: { datos: [source] } }),
        }) as Response,
    );
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('categorizes a newly synced movement by normalized RUT and persists the raw giro', async () => {
    const h = setup();
    const result = await h.sync();
    expect(result.errors).toEqual([]);
    expect(h.state().counterparties[0]).toMatchObject({
      taxId: '12.345.678-5',
      giro: 'Construcción industrial',
    });
    expect(h.state().movements[0]).toMatchObject({
      source: 'TAX_SYNC',
      categoryId: 'rut-category',
      counterpartyId: 'cp-0',
    });
    expect(h.state().documents[0].metadata.raw).toEqual(source);
    expect(h.tx.categoryRule.findMany).toHaveBeenCalled();
    const documentWrite = required(h.writes.find((w) => w.entity === 'document'));
    const movementWrite = required(h.writes.find((w) => w.entity === 'movement'));
    const linkWrite = required(h.writes.find((w) => w.entity === 'link'));
    expect(documentWrite.scope).not.toBe(movementWrite.scope);
    expect(movementWrite.scope).toBe(linkWrite.scope);
  });

  it('uses the persisted counterpartys giro for GIRO rules, including on later documents', async () => {
    const h = setup();
    await h.sync();
    h.setRules([
      {
        ruleType: 'GIRO',
        matchValue: 'CONSTRUCCION',
        categoryId: 'giro-category',
      },
    ]);
    fetchMock.mockImplementation(
      async () =>
        ({
          ok: true,
          status: 200,
          text: async () => JSON.stringify([{ ...source, Folio: 2, GiroEmis: undefined }]),
        }) as Response,
    );
    await h.sync();
    expect(h.state().movements[1].categoryId).toBe('giro-category');
    expect(h.state().counterparties).toHaveLength(1);
    expect(h.state().counterparties[0].giro).toBe('Construcción industrial');
  });

  it('enriches a linked movement on repeat sync without creating or recategorizing it', async () => {
    const h = setup();
    fetchMock.mockImplementation(
      async () =>
        ({
          ok: true,
          status: 200,
          text: async () => JSON.stringify([{ ...source, GiroEmis: undefined }]),
        }) as Response,
    );
    await h.sync();
    expect(h.state().counterparties[0].giro).toBeNull();
    h.setRules([
      {
        ruleType: 'GIRO',
        matchValue: 'Construcción',
        categoryId: 'new-category',
      },
    ]);
    fetchMock.mockImplementation(
      async () =>
        ({ ok: true, status: 200, text: async () => JSON.stringify([source]) }) as Response,
    );
    await h.sync();
    expect(h.state().movements).toHaveLength(1);
    expect(h.state().movements[0].categoryId).toBe('rut-category');
    expect(h.state().counterparties[0].giro).toBe('Construcción industrial');
    expect(h.state().documents[0].metadata.raw.GiroEmis).toBe('Construcción industrial');
    expect(h.tx.categoryRule.findMany).toHaveBeenCalledTimes(1);
  });

  it('does not enrich a stored folio from a different counterparty on repeat sync', async () => {
    const h = setup();
    fetchMock.mockImplementation(
      async () =>
        ({
          ok: true,
          status: 200,
          text: async () => JSON.stringify([{ ...source, GiroEmis: undefined }]),
        }) as Response,
    );
    await h.sync();
    fetchMock.mockImplementation(
      async () =>
        ({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify([
              { ...source, 'RUT Proveedor': '11.111.111-1', GiroEmis: 'Giro ajeno' },
            ]),
        }) as Response,
    );
    await h.sync();
    expect(h.state().counterparties[0].giro).toBeNull();
    expect(h.state().documents[0].metadata.raw.GiroEmis).toBeUndefined();
    expect(h.state().movements).toHaveLength(1);
  });

  it('on a sale uses the receivers giro, never the companys GiroEmis', async () => {
    const h = setup();
    fetchMock.mockImplementation(
      async () =>
        ({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify([
              {
                ...source,
                'Rut cliente': '12.345.678-5',
                GiroEmis: 'Giro de la empresa propia',
                GiroRecep: 'Comercio minorista',
              },
            ]),
        }) as Response,
    );
    await h.sync(DocumentDirection.EMITIDO);
    expect(h.state().counterparties[0]).toMatchObject({
      type: 'CLIENT',
      giro: 'Comercio minorista',
    });
  });

  it('keeps a failed movements document and continues importing later documents', async () => {
    const h = setup();
    fetchMock.mockImplementation(
      async () =>
        ({
          ok: true,
          status: 200,
          text: async () => JSON.stringify([source, { ...source, Folio: 2 }]),
        }) as Response,
    );
    h.tx.movement.create.mockRejectedValueOnce(new Error('Movement failure'));
    const result = await h.sync();
    expect(result.errors).toEqual([{ folio: 1, message: 'Movement failure' }]);
    expect(h.state().documents).toHaveLength(2);
    expect(h.state().documents[0].movementId).toBeNull();
    expect(h.state().movements).toHaveLength(1);
    expect(h.state().documents[1].movementId).toBe(h.state().movements[0].id);
  });

  it('backfills only null giro from the latest linked source and is idempotent', async () => {
    const h = setup();
    await h.sync();
    h.state().counterparties[0].giro = null;
    h.state().documents.push({
      ...h.state().documents[0],
      id: 'older',
      issueDate: new Date('2026-08-01'),
      metadata: { raw: { GiroEmis: 'Giro anterior' } },
    });
    h.tx.movement.create.mockClear();
    h.tx.categoryRule.findMany.mockClear();
    expect(await h.tax.backfillCounterpartyGiro(companyId, userId)).toBe(1);
    expect(await h.tax.backfillCounterpartyGiro(companyId, userId)).toBe(0);
    expect(h.state().counterparties[0].giro).toBe('Construcción industrial');
    expect(h.state().movements[0].categoryId).toBe('rut-category');
    expect(h.tx.movement.create).not.toHaveBeenCalled();
    expect(h.tx.categoryRule.findMany).not.toHaveBeenCalled();
    expect(h.tx.taxDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId, movementId: { not: null } }, take: 100 }),
    );
  });

  it('preserves a manual giro during repeat sync, later documents and backfill', async () => {
    const h = setup();
    await h.sync();
    h.state().counterparties[0].giro = 'Giro manual';
    h.tx.counterparty.updateMany.mockClear();
    await h.sync();
    fetchMock.mockImplementation(
      async () =>
        ({
          ok: true,
          status: 200,
          text: async () => JSON.stringify([{ ...source, Folio: 2, GiroEmis: 'Otro giro SII' }]),
        }) as Response,
    );
    await h.sync();
    expect(await h.tax.backfillCounterpartyGiro(companyId, userId)).toBe(0);
    expect(h.state().counterparties[0].giro).toBe('Giro manual');
    expect(h.state().movements).toHaveLength(2);
    // Both linked-document paths must constrain the write to a null source fact.
    for (const [args] of h.tx.counterparty.updateMany.mock.calls) {
      expect(args.where).toEqual({ id: 'cp-0', companyId, giro: null });
    }
  });

  it('does not backfill a giro into a linked party with another RUT or company', async () => {
    const h = setup();
    await h.sync();
    h.state().counterparties[0].giro = null;
    h.state().counterparties[0].taxId = '11.111.111-1';
    expect(await h.tax.backfillCounterpartyGiro(companyId, userId)).toBe(0);
    h.state().counterparties[0].taxId = '12.345.678-5';
    h.state().counterparties[0].companyId = 'company-b';
    expect(await h.tax.backfillCounterpartyGiro(companyId, userId)).toBe(0);
    expect(h.state().counterparties[0].giro).toBeNull();
  });
});

describe('FIN-A explicit source giro extraction', () => {
  it.each([
    null,
    {},
    { raw: null },
    { raw: [] },
    { raw: { GiroEmis: 123 } },
    { raw: { GiroEmis: ' ' } },
  ])('keeps unknown source facts null (%j)', (metadata) => {
    expect(readCounterpartyGiro(metadata, 'RECIBIDO')).toBeNull();
  });
  it('accepts field-name casing, trims text and does not infer the other partys giro', () => {
    expect(readCounterpartyGiro({ raw: { giroEmis: ' Construcción ' } }, 'RECIBIDO')).toBe(
      'Construcción',
    );
    expect(readCounterpartyGiro({ raw: { GiroEmis: 'Construcción' } }, 'EMITIDO')).toBeNull();
  });
});
