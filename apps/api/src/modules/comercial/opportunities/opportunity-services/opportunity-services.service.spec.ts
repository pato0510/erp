/* COM-006 — proves the bundle rules: PRICE SNAPSHOT (unitPrice copied from
 * basePrice on add, immune to later catalog price changes), DERIVED TOTAL
 * (estimatedValue = Σ quantity×unitPrice, recomputed on every add/edit/remove; last
 * line removed keeps the last derived value), inactive-service rejection, closed-
 * opportunity rejection, cross-company rejection, and the duplicate-service unique.
 * Plus the OpportunitiesService.update guard: manual estimatedValue rejected while
 * lines exist, allowed once the bundle is empty. Stateful fake Prisma/RLS (same
 * style as the accounts/contacts/opportunities specs) so the recomputed value is
 * really asserted. */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { OpportunityStage, Prisma } from '@prisma/client';
import { OpportunitiesService } from '../opportunities.service';
import { OpportunityServicesService } from './opportunity-services.service';

type Any = Record<string, unknown>;
const S = OpportunityStage;

interface FakeOpts {
  stage?: OpportunityStage;
  estimatedValue?: unknown;
  // catalog: id -> { basePrice, isActive, companyId }
  catalog?: Record<string, { basePrice: number; isActive?: boolean; companyId?: string }>;
}

function makeWorld(opts: FakeOpts = {}) {
  const opp: Any = {
    id: 'o1',
    companyId: 'c1',
    stage: opts.stage ?? S.NEGOCIACION,
    estimatedValue: opts.estimatedValue ?? null,
  };
  const catalog: Record<string, Any> = {};
  for (const [id, s] of Object.entries(
    opts.catalog ?? { s1: { basePrice: 10000 }, s2: { basePrice: 5000 } },
  )) {
    catalog[id] = {
      id,
      companyId: s.companyId ?? 'c1',
      basePrice: s.basePrice,
      isActive: s.isActive ?? true,
    };
  }
  const lines: Any[] = [];
  let seq = 1;

  const matchesOppScope = (l: Any, w: Any) =>
    (w.companyId === undefined || l.companyId === w.companyId) &&
    (w.opportunityId === undefined || l.opportunityId === w.opportunityId);

  const opportunityService = {
    findFirst: jest.fn((args: Any) => {
      const w = args.where as Any;
      const found = lines.find(
        (l) =>
          (w.id === undefined || l.id === w.id) &&
          matchesOppScope(l, w) &&
          (w.serviceId === undefined || l.serviceId === w.serviceId),
      );
      return Promise.resolve(found ?? null);
    }),
    findMany: jest.fn((args: Any) =>
      Promise.resolve(lines.filter((l) => matchesOppScope(l, (args?.where as Any) ?? {}))),
    ),
    count: jest.fn((args: Any) =>
      Promise.resolve(lines.filter((l) => matchesOppScope(l, (args?.where as Any) ?? {})).length),
    ),
    create: jest.fn((args: Any) => {
      const row = { id: `l${seq++}`, ...(args.data as Any) };
      lines.push(row);
      return Promise.resolve(row);
    }),
    update: jest.fn((args: Any) => {
      const row = lines.find((l) => l.id === (args.where as Any).id) as Any;
      Object.assign(row, args.data);
      return Promise.resolve(row);
    }),
    delete: jest.fn((args: Any) => {
      const idx = lines.findIndex((l) => l.id === (args.where as Any).id);
      const [row] = lines.splice(idx, 1);
      return Promise.resolve(row);
    }),
  };
  const opportunity = {
    findFirst: jest.fn((args: Any) => {
      const w = args.where as Any;
      return Promise.resolve(w.id === opp.id && w.companyId === opp.companyId ? opp : null);
    }),
    update: jest.fn((args: Any) => {
      Object.assign(opp, args.data as Any);
      return Promise.resolve({ ...opp });
    }),
  };
  const serviceCatalog = {
    findFirst: jest.fn((args: Any) => {
      const w = args.where as Any;
      const s = catalog[w.id as string];
      return Promise.resolve(s && s.companyId === w.companyId ? s : null);
    }),
  };
  const account = { findFirst: jest.fn(() => Promise.resolve({ id: 'acc1' })) };
  // COM-009 — bundle mutations must NEVER write a timeline activity. This spy proves it.
  const activity = { create: jest.fn(() => Promise.resolve({ id: 'act1' })) };

  const prisma = {
    opportunity,
    opportunityService,
    serviceCatalog,
    account,
    activity,
  } as unknown as ConstructorParameters<typeof OpportunityServicesService>[0];
  const rls = {
    executeWithRls: (_c: string, _u: string, fn: (t: unknown) => unknown) => fn(prisma),
  } as unknown as ConstructorParameters<typeof OpportunityServicesService>[1];

  return {
    bundle: new OpportunityServicesService(prisma, rls),
    opps: new OpportunitiesService(prisma, rls),
    opp,
    lines,
    catalog,
    activityCreate: activity.create,
  };
}

const est = (opp: Any) => Number((opp.estimatedValue as { toString(): string }).toString());

describe('OpportunityServicesService — price snapshot', () => {
  it('add WITHOUT explicit price → unitPrice equals catalog basePrice at add time', async () => {
    const { bundle, lines, catalog } = makeWorld({ catalog: { s1: { basePrice: 10000 } } });
    await bundle.add('c1', 'u1', 'o1', { serviceId: 's1', quantity: 2 });
    expect(Number(lines[0].unitPrice as Prisma.Decimal)).toBe(10000);

    // Later catalog price change must NOT alter the existing line (snapshot pinned).
    (catalog.s1 as Any).basePrice = 99999;
    expect(Number(lines[0].unitPrice as Prisma.Decimal)).toBe(10000);
  });

  it('add WITH explicit price → overrides basePrice (negotiated per deal)', async () => {
    const { bundle, lines } = makeWorld({ catalog: { s1: { basePrice: 10000 } } });
    await bundle.add('c1', 'u1', 'o1', { serviceId: 's1', quantity: 1, unitPrice: 8000 });
    expect(Number(lines[0].unitPrice as Prisma.Decimal)).toBe(8000);
  });
});

describe('OpportunityServicesService — derived total (Σ quantity × unitPrice)', () => {
  it('recomputes estimatedValue on add / edit / remove with the exact sum', async () => {
    const { bundle, opp, lines } = makeWorld({
      catalog: { s1: { basePrice: 10000 }, s2: { basePrice: 5000 } },
    });

    // add s1 × 2 @10000 → 20000
    await bundle.add('c1', 'u1', 'o1', { serviceId: 's1', quantity: 2 });
    expect(est(opp)).toBe(20000);

    // add s2 × 1 @5000 → 20000 + 5000 = 25000
    await bundle.add('c1', 'u1', 'o1', { serviceId: 's2', quantity: 1 });
    expect(est(opp)).toBe(25000);

    // edit s1 line qty → 3 → 30000 + 5000 = 35000
    const s1Line = lines.find((l) => l.serviceId === 's1') as Any;
    await bundle.update('c1', 'u1', 'o1', s1Line.id as string, { quantity: 3 });
    expect(est(opp)).toBe(35000);

    // edit s1 line unitPrice → 12000 → 36000 + 5000 = 41000
    await bundle.update('c1', 'u1', 'o1', s1Line.id as string, { unitPrice: 12000 });
    expect(est(opp)).toBe(41000);

    // remove s2 line → 36000 (only s1: 3 × 12000)
    const s2Line = lines.find((l) => l.serviceId === 's2') as Any;
    await bundle.remove('c1', 'u1', 'o1', s2Line.id as string);
    expect(est(opp)).toBe(36000);
  });

  it('fractional quantity (2.5 months) derives correctly', async () => {
    const { bundle, opp } = makeWorld({ catalog: { s1: { basePrice: 4000 } } });
    await bundle.add('c1', 'u1', 'o1', { serviceId: 's1', quantity: 2.5 });
    expect(est(opp)).toBe(10000); // 2.5 × 4000
  });

  it('removing the LAST line keeps the last derived value (does not zero it)', async () => {
    const { bundle, opp, lines } = makeWorld({ catalog: { s1: { basePrice: 10000 } } });
    await bundle.add('c1', 'u1', 'o1', { serviceId: 's1', quantity: 2 });
    expect(est(opp)).toBe(20000);
    await bundle.remove('c1', 'u1', 'o1', (lines[0] as Any).id as string);
    expect(est(opp)).toBe(20000); // kept — NOT reset to 0
  });
});

describe('OpportunitiesService.update — manual estimatedValue guard (COM-006)', () => {
  it('REJECTS manual estimatedValue while the bundle has lines', async () => {
    const { bundle, opps } = makeWorld({ catalog: { s1: { basePrice: 10000 } } });
    await bundle.add('c1', 'u1', 'o1', { serviceId: 's1', quantity: 1 });
    await expect(
      opps.update('o1', 'c1', 'u1', { estimatedValue: 12345 } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ALLOWS manual estimatedValue once the bundle is empty (last line removed)', async () => {
    const { bundle, opps, opp, lines } = makeWorld({ catalog: { s1: { basePrice: 10000 } } });
    await bundle.add('c1', 'u1', 'o1', { serviceId: 's1', quantity: 1 });
    await bundle.remove('c1', 'u1', 'o1', (lines[0] as Any).id as string);
    await opps.update('o1', 'c1', 'u1', { estimatedValue: 12345 } as never);
    expect(est(opp)).toBe(12345); // manual editing re-enabled
  });

  it('ALLOWS manual estimatedValue when there was never a bundle (current behavior)', async () => {
    const { opps, opp } = makeWorld({});
    await opps.update('o1', 'c1', 'u1', { estimatedValue: 777 } as never);
    expect(est(opp)).toBe(777);
  });
});

describe('OpportunityServicesService — add validation', () => {
  it('rejects an INACTIVE catalog service on add (historical lines untouched by deactivation)', async () => {
    const { bundle } = makeWorld({ catalog: { s1: { basePrice: 10000, isActive: false } } });
    await expect(
      bundle.add('c1', 'u1', 'o1', { serviceId: 's1', quantity: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a cross-company service reference on add', async () => {
    const { bundle } = makeWorld({ catalog: { s1: { basePrice: 10000, companyId: 'OTHER' } } });
    await expect(
      bundle.add('c1', 'u1', 'o1', { serviceId: 's1', quantity: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a cross-company / missing opportunity reference on add', async () => {
    const { bundle } = makeWorld({});
    await expect(
      bundle.add('c1', 'u1', 'o-other', { serviceId: 's1', quantity: 1 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a DUPLICATE service on the same opportunity (the @@unique)', async () => {
    const { bundle } = makeWorld({ catalog: { s1: { basePrice: 10000 } } });
    await bundle.add('c1', 'u1', 'o1', { serviceId: 's1', quantity: 1 });
    await expect(
      bundle.add('c1', 'u1', 'o1', { serviceId: 's1', quantity: 3 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('OpportunityServicesService — closed-opportunity guard (Rule 5)', () => {
  for (const stage of [S.GANADA, S.PERDIDA] as const) {
    it(`rejects add on a ${stage} opportunity (historical bundle)`, async () => {
      const { bundle } = makeWorld({ stage, catalog: { s1: { basePrice: 10000 } } });
      await expect(
        bundle.add('c1', 'u1', 'o1', { serviceId: 's1', quantity: 1 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  }

  it('ALLOWS add on an EN_PAUSA opportunity', async () => {
    const { bundle, opp } = makeWorld({ stage: S.EN_PAUSA, catalog: { s1: { basePrice: 10000 } } });
    await bundle.add('c1', 'u1', 'o1', { serviceId: 's1', quantity: 2 });
    expect(est(opp)).toBe(20000);
  });
});

describe('OpportunityServicesService — COM-009: bundle mutations write NO timeline entry', () => {
  it('add / edit / remove never create a system activity (too noisy)', async () => {
    const { bundle, lines, activityCreate } = makeWorld({ catalog: { s1: { basePrice: 10000 } } });
    await bundle.add('c1', 'u1', 'o1', { serviceId: 's1', quantity: 2 });
    await bundle.update('c1', 'u1', 'o1', (lines[0] as Any).id as string, { quantity: 3 });
    await bundle.remove('c1', 'u1', 'o1', (lines[0] as Any).id as string);
    expect(activityCreate).not.toHaveBeenCalled();
  });
});
