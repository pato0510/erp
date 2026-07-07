/* COM-010 — proves the quote model: COPY-not-mirror semantics (incl. serviceName
 * snapshot), Chilean IVA math + whole-CLP half-up rounding with the PERSISTED rate, the
 * full state machine (send/accept/reject, auto-supersede, one-accepted, terminality,
 * ENVIADA immutability), per-company numbering + per-opportunity versioning, and the
 * BORRADOR-only edit/delete guards. Stateful fake Prisma/RLS (a generic table helper in
 * the COM-006 style). */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { QuotesService } from './quotes.service';

type Any = Record<string, unknown>;
const num = (d: unknown) => Number(d as number);

/* A minimal Prisma-delegate fake: eq / {in} / {not} where-matching, single-key orderBy,
 * count, create (+ id), createMany, update, updateMany, delete. */
function table(rows: Any[], prefix: string) {
  let seq = 1;
  const match = (r: Any, where: Any = {}) =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        if ('in' in (v as Any)) return ((v as Any).in as unknown[]).includes(r[k]);
        if ('not' in (v as Any)) return r[k] !== (v as Any).not;
      }
      return r[k] === v;
    });
  const sort = (rs: Any[], orderBy: Any) => {
    const ob = Array.isArray(orderBy) ? orderBy[0] : orderBy;
    const [k, dir] = Object.entries(ob)[0] as [string, string];
    return [...rs].sort((a, b) => {
      const av = a[k] as never;
      const bv = b[k] as never;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return dir === 'desc' ? -cmp : cmp;
    });
  };
  return {
    _rows: rows,
    findFirst: jest.fn((args: Any = {}) => {
      let rs = rows.filter((r) => match(r, args.where as Any));
      if (args.orderBy) rs = sort(rs, args.orderBy as Any);
      return Promise.resolve(rs[0] ?? null);
    }),
    findMany: jest.fn((args: Any = {}) => {
      let rs = rows.filter((r) => match(r, args.where as Any));
      if (args.orderBy) rs = sort(rs, args.orderBy as Any);
      return Promise.resolve(rs);
    }),
    count: jest.fn((args: Any = {}) =>
      Promise.resolve(rows.filter((r) => match(r, args.where as Any)).length),
    ),
    create: jest.fn((args: Any) => {
      const row = { id: (args.data as Any).id ?? `${prefix}${seq++}`, ...(args.data as Any) };
      rows.push(row);
      return Promise.resolve({ ...row });
    }),
    createMany: jest.fn((args: Any) => {
      (args.data as Any[]).forEach((d) => rows.push({ id: d.id ?? `${prefix}m${seq++}`, ...d }));
      return Promise.resolve({ count: (args.data as Any[]).length });
    }),
    update: jest.fn((args: Any) => {
      const r = rows.find((x) => match(x, args.where as Any)) as Any;
      Object.assign(r, args.data);
      return Promise.resolve({ ...r });
    }),
    updateMany: jest.fn((args: Any) => {
      const rs = rows.filter((x) => match(x, args.where as Any));
      rs.forEach((r) => Object.assign(r, args.data));
      return Promise.resolve({ count: rs.length });
    }),
    delete: jest.fn((args: Any) => {
      const i = rows.findIndex((x) => match(x, args.where as Any));
      const [r] = rows.splice(i, 1);
      return Promise.resolve(r);
    }),
  };
}

interface WorldOpts {
  oppStage?: string;
  bundle?: { serviceId: string; quantity: number; unitPrice: number; notes?: string | null }[];
  catalog?: Record<string, { name: string; basePrice: number; isActive?: boolean }>;
  seedQuotes?: Any[];
  seedLines?: Any[];
}

function makeWorld(opts: WorldOpts = {}) {
  const oppRows: Any[] = [
    { id: 'o1', companyId: 'c1', accountId: 'acc1', stage: opts.oppStage ?? 'NEGOCIACION' },
  ];
  const bundleRows: Any[] = (
    opts.bundle ?? [{ serviceId: 's1', quantity: 2, unitPrice: 10000 }]
  ).map((b, i) => ({
    id: `b${i + 1}`,
    companyId: 'c1',
    opportunityId: 'o1',
    serviceId: b.serviceId,
    quantity: b.quantity,
    unitPrice: b.unitPrice,
    notes: b.notes ?? null,
    createdAt: new Date(Date.UTC(2026, 0, i + 1)),
  }));
  const catalogRows: Any[] = Object.entries(
    opts.catalog ?? { s1: { name: 'Aseo', basePrice: 10000 } },
  ).map(([id, c]) => ({
    id,
    companyId: 'c1',
    name: c.name,
    basePrice: c.basePrice,
    isActive: c.isActive ?? true,
  }));

  const opportunity = table(oppRows, 'o');
  const opportunityService = table(bundleRows, 'b');
  const serviceCatalog = table(catalogRows, 's');
  const quote = table(opts.seedQuotes ? [...opts.seedQuotes] : [], 'q');
  const quoteLine = table(opts.seedLines ? [...opts.seedLines] : [], 'ql');

  const prisma = {
    opportunity,
    opportunityService,
    serviceCatalog,
    quote,
    quoteLine,
  } as unknown as ConstructorParameters<typeof QuotesService>[0];
  const rls = {
    executeWithRls: (_c: string, _u: string, fn: (t: unknown) => unknown) => fn(prisma),
  } as unknown as ConstructorParameters<typeof QuotesService>[1];

  return {
    svc: new QuotesService(prisma, rls),
    quote,
    quoteLine,
    bundleRows,
    catalogRows,
  };
}

const seededQuote = (over: Any = {}): Any => ({
  id: 'q1',
  companyId: 'c1',
  opportunityId: 'o1',
  quoteNumber: 'COT-0001',
  version: 1,
  status: 'BORRADOR',
  validUntil: null,
  netAmount: new Prisma.Decimal(0),
  taxAmount: new Prisma.Decimal(0),
  totalAmount: new Prisma.Decimal(0),
  taxRate: new Prisma.Decimal(19),
  notes: null,
  sentAt: null,
  acceptedAt: null,
  rejectedAt: null,
  createdBy: 'u1',
  ...over,
});
const FUTURE = new Date(Date.UTC(2999, 11, 31));
const PAST = new Date(Date.UTC(2020, 0, 1));

describe('QuotesService — create: copy semantics + tax snapshot', () => {
  it('copies the bundle into quote_lines with a serviceName snapshot + persisted amounts/rate', async () => {
    const { svc } = makeWorld({
      bundle: [{ serviceId: 's1', quantity: 2, unitPrice: 10000 }],
      catalog: { s1: { name: 'Aseo', basePrice: 10000 } },
    });
    const q = (await svc.create('c1', 'u1', 'o1', {})) as Any;
    const lines = q.lines as Any[];
    expect(lines).toHaveLength(1);
    expect(lines[0].serviceName).toBe('Aseo'); // snapshot
    expect(num(lines[0].quantity)).toBe(2);
    expect(num(lines[0].unitPrice)).toBe(10000);
    expect(num(lines[0].lineTotal)).toBe(20000);
    expect(num(q.netAmount)).toBe(20000);
    expect(num(q.taxAmount)).toBe(3800); // 19% of 20000
    expect(num(q.totalAmount)).toBe(23800);
    expect(num(q.taxRate)).toBe(19); // persisted rate
    expect(q.status).toBe('BORRADOR');
  });

  it('a later BUNDLE change does NOT touch the quote lines (copy, not mirror)', async () => {
    const world = makeWorld({ bundle: [{ serviceId: 's1', quantity: 2, unitPrice: 10000 }] });
    const q = (await world.svc.create('c1', 'u1', 'o1', {})) as Any;
    // Simulate the opportunity bundle being edited afterwards.
    (world.bundleRows[0] as Any).quantity = 99;
    world.bundleRows.push({
      id: 'bX',
      companyId: 'c1',
      opportunityId: 'o1',
      serviceId: 's1',
      quantity: 5,
      unitPrice: 10000,
    });
    // The persisted quote lines are independent copies — untouched by the bundle edit.
    const lines = world.quoteLine._rows.filter((l) => l.quoteId === q.id);
    expect(lines).toHaveLength(1);
    expect(num(lines[0].quantity)).toBe(2); // unchanged
  });

  it('a catalog RENAME does not change serviceName on existing lines (snapshot)', async () => {
    const world = makeWorld({ catalog: { s1: { name: 'Aseo', basePrice: 10000 } } });
    const q = (await world.svc.create('c1', 'u1', 'o1', {})) as Any;
    (world.catalogRows[0] as Any).name = 'Aseo Industrial Premium';
    const lines = world.quoteLine._rows.filter((l) => l.quoteId === q.id);
    expect(lines[0].serviceName).toBe('Aseo');
  });

  it('rounds tax to whole CLP, HALF-UP (net 50 → tax 10, not 9)', async () => {
    const { svc } = makeWorld({
      bundle: [{ serviceId: 's1', quantity: 1, unitPrice: 50 }],
      catalog: { s1: { name: 'X', basePrice: 50 } },
    });
    const q = (await svc.create('c1', 'u1', 'o1', {})) as Any;
    expect(num(q.netAmount)).toBe(50);
    expect(num(q.taxAmount)).toBe(10); // 9.5 → 10 (half-up)
    expect(num(q.totalAmount)).toBe(60);
  });

  it('rejects creating from an EMPTY bundle (400)', async () => {
    const { svc } = makeWorld({ bundle: [] });
    await expect(svc.create('c1', 'u1', 'o1', {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects creating from a CLOSED opportunity (409)', async () => {
    const { svc } = makeWorld({ oppStage: 'GANADA' });
    await expect(svc.create('c1', 'u1', 'o1', {})).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a cross-company opportunity (404)', async () => {
    const { svc } = makeWorld({});
    await expect(svc.create('OTHER', 'u1', 'o1', {})).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('QuotesService — numbering + versioning', () => {
  it('assigns per-company sequential quoteNumber and per-opportunity version', async () => {
    // Pre-seed a quote on a DIFFERENT opportunity (version 5, COT-0009): the new quote
    // must get version 1 (per-opp) but quoteNumber COT-0010 (per-company max+1).
    const { svc } = makeWorld({
      seedQuotes: [
        seededQuote({
          id: 'qX',
          opportunityId: 'oX',
          version: 5,
          quoteNumber: 'COT-0009',
          status: 'ENVIADA',
        }),
      ],
    });
    const q1 = (await svc.create('c1', 'u1', 'o1', {})) as Any;
    expect(q1.quoteNumber).toBe('COT-0010');
    expect(q1.version).toBe(1);
    const q2 = (await svc.create('c1', 'u1', 'o1', {})) as Any;
    expect(q2.quoteNumber).toBe('COT-0011');
    expect(q2.version).toBe(2); // per-opportunity
  });
});

describe('QuotesService — BORRADOR line edits recompute amounts', () => {
  it('editing a line quantity recomputes lineTotal + net/tax/total', async () => {
    const { svc, quote } = makeWorld({
      bundle: [{ serviceId: 's1', quantity: 2, unitPrice: 10000 }],
    });
    const q = (await svc.create('c1', 'u1', 'o1', {})) as Any;
    const lineId = (q.lines as Any[])[0].id as string;
    await svc.updateLine('c1', 'u1', q.id as string, lineId, { quantity: 3 });
    const row = quote._rows.find((r) => r.id === q.id) as Any;
    expect(num(row.netAmount)).toBe(30000);
    expect(num(row.taxAmount)).toBe(5700); // 19% of 30000
    expect(num(row.totalAmount)).toBe(35700);
  });

  it('adding a line (active service, price snapshot) recomputes; removing recomputes', async () => {
    const { svc, quote } = makeWorld({
      bundle: [{ serviceId: 's1', quantity: 1, unitPrice: 10000 }],
      catalog: { s1: { name: 'A', basePrice: 10000 }, s2: { name: 'B', basePrice: 5000 } },
    });
    const q = (await svc.create('c1', 'u1', 'o1', {})) as Any;
    await svc.addLine('c1', 'u1', q.id as string, { serviceId: 's2', quantity: 2 }); // 2×5000 = 10000
    let row = quote._rows.find((r) => r.id === q.id) as Any;
    expect(num(row.netAmount)).toBe(20000);
    const firstLineId = (q.lines as Any[])[0].id as string;
    await svc.removeLine('c1', 'u1', q.id as string, firstLineId);
    row = quote._rows.find((r) => r.id === q.id) as Any;
    expect(num(row.netAmount)).toBe(10000);
  });

  it('rejects adding an INACTIVE service (400)', async () => {
    const { svc } = makeWorld({
      bundle: [{ serviceId: 's1', quantity: 1, unitPrice: 10000 }],
      catalog: {
        s1: { name: 'A', basePrice: 10000 },
        s2: { name: 'B', basePrice: 5000, isActive: false },
      },
    });
    const q = (await svc.create('c1', 'u1', 'o1', {})) as Any;
    await expect(
      svc.addLine('c1', 'u1', q.id as string, { serviceId: 's2', quantity: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('QuotesService — state machine', () => {
  it('BORRADOR→ENVIADA with lines + validUntil sets sentAt', async () => {
    const { svc } = makeWorld({});
    const q = (await svc.create('c1', 'u1', 'o1', { validUntil: '2999-12-31' })) as Any;
    const sent = (await svc.changeStatus('c1', 'u1', q.id as string, {
      status: 'ENVIADA' as never,
    })) as Any;
    expect(sent.status).toBe('ENVIADA');
    expect(sent.sentAt).toBeInstanceOf(Date);
  });

  it('send WITHOUT validUntil → 400', async () => {
    const { svc } = makeWorld({});
    const q = (await svc.create('c1', 'u1', 'o1', {})) as Any; // no validUntil
    await expect(
      svc.changeStatus('c1', 'u1', q.id as string, { status: 'ENVIADA' as never }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('send WITHOUT lines → 400 (after removing the only line)', async () => {
    const { svc } = makeWorld({});
    const q = (await svc.create('c1', 'u1', 'o1', { validUntil: '2999-12-31' })) as Any;
    await svc.removeLine('c1', 'u1', q.id as string, (q.lines as Any[])[0].id as string);
    await expect(
      svc.changeStatus('c1', 'u1', q.id as string, { status: 'ENVIADA' as never }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ENVIADA→ACEPTADA (valid) sets acceptedAt AND auto-supersedes the other non-terminal quotes', async () => {
    const { svc, quote } = makeWorld({
      seedQuotes: [
        seededQuote({
          id: 'q1',
          quoteNumber: 'COT-0001',
          version: 1,
          status: 'ENVIADA',
          validUntil: FUTURE,
        }),
        seededQuote({ id: 'q2', quoteNumber: 'COT-0002', version: 2, status: 'BORRADOR' }),
        seededQuote({
          id: 'q3',
          quoteNumber: 'COT-0003',
          version: 3,
          status: 'ENVIADA',
          validUntil: FUTURE,
        }),
      ],
    });
    const accepted = (await svc.changeStatus('c1', 'u1', 'q1', {
      status: 'ACEPTADA' as never,
    })) as Any;
    expect(accepted.status).toBe('ACEPTADA');
    expect(accepted.acceptedAt).toBeInstanceOf(Date);
    expect((quote._rows.find((r) => r.id === 'q2') as Any).status).toBe('SUPERSEDIDA');
    expect((quote._rows.find((r) => r.id === 'q3') as Any).status).toBe('SUPERSEDIDA');
  });

  it('accept an EXPIRED quote → 400', async () => {
    const { svc } = makeWorld({
      seedQuotes: [seededQuote({ id: 'q1', status: 'ENVIADA', validUntil: PAST })],
    });
    await expect(
      svc.changeStatus('c1', 'u1', 'q1', { status: 'ACEPTADA' as never }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('DOUBLE accept (another ACEPTADA already exists) → 409', async () => {
    const { svc } = makeWorld({
      seedQuotes: [
        seededQuote({
          id: 'q0',
          quoteNumber: 'COT-0001',
          version: 1,
          status: 'ACEPTADA',
          validUntil: FUTURE,
        }),
        seededQuote({
          id: 'q1',
          quoteNumber: 'COT-0002',
          version: 2,
          status: 'ENVIADA',
          validUntil: FUTURE,
        }),
      ],
    });
    await expect(
      svc.changeStatus('c1', 'u1', 'q1', { status: 'ACEPTADA' as never }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('ENVIADA→RECHAZADA sets rejectedAt', async () => {
    const { svc } = makeWorld({
      seedQuotes: [seededQuote({ id: 'q1', status: 'ENVIADA', validUntil: FUTURE })],
    });
    const r = (await svc.changeStatus('c1', 'u1', 'q1', { status: 'RECHAZADA' as never })) as Any;
    expect(r.status).toBe('RECHAZADA');
    expect(r.rejectedAt).toBeInstanceOf(Date);
  });

  it('terminal states reject any transition (ACEPTADA / RECHAZADA / SUPERSEDIDA → 400)', async () => {
    for (const status of ['ACEPTADA', 'RECHAZADA', 'SUPERSEDIDA']) {
      const { svc } = makeWorld({ seedQuotes: [seededQuote({ id: 'q1', status })] });
      await expect(
        svc.changeStatus('c1', 'u1', 'q1', { status: 'ENVIADA' as never }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('an illegal jump (BORRADOR→ACEPTADA) → 400', async () => {
    const { svc } = makeWorld({ seedQuotes: [seededQuote({ id: 'q1', status: 'BORRADOR' })] });
    await expect(
      svc.changeStatus('c1', 'u1', 'q1', { status: 'ACEPTADA' as never }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('QuotesService — ENVIADA immutability + delete rules', () => {
  const sent = () =>
    makeWorld({ seedQuotes: [seededQuote({ id: 'q1', status: 'ENVIADA', validUntil: FUTURE })] });

  it('general update of a sent quote (notes) → 409', async () => {
    const { svc } = sent();
    await expect(svc.update('c1', 'u1', 'q1', { notes: 'x' } as never)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('validUntil edit on a sent quote → 409 (immutable document)', async () => {
    const { svc } = sent();
    await expect(
      svc.update('c1', 'u1', 'q1', { validUntil: '2999-01-01' } as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('general update REJECTS a status edit (400) — must use the transition endpoint', async () => {
    const { svc } = makeWorld({ seedQuotes: [seededQuote({ id: 'q1', status: 'BORRADOR' })] });
    await expect(
      svc.update('c1', 'u1', 'q1', { status: 'ENVIADA' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('add/edit/remove line on a sent quote → 409', async () => {
    const { svc } = sent();
    await expect(
      svc.addLine('c1', 'u1', 'q1', { serviceId: 's1', quantity: 1 } as never),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      svc.updateLine('c1', 'u1', 'q1', 'lineX', { quantity: 2 } as never),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(svc.removeLine('c1', 'u1', 'q1', 'lineX')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('delete a BORRADOR is allowed; delete a non-BORRADOR → 409', async () => {
    const draft = makeWorld({ seedQuotes: [seededQuote({ id: 'q1', status: 'BORRADOR' })] });
    await draft.svc.remove('c1', 'u1', 'q1');
    expect(draft.quote._rows.find((r) => r.id === 'q1')).toBeUndefined();

    const { svc } = sent();
    await expect(svc.remove('c1', 'u1', 'q1')).rejects.toBeInstanceOf(ConflictException);
  });
});
