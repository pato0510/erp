import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CategoryRule, MovementStatus, MovementType, PeriodStatus } from '@prisma/client';
import { CategoryRulesService } from '../catalogs/category-rules.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { RlsService } from '../common/rls/rls.service';
import { MovementRecategorizationService } from './movement-recategorization.service';
import { MovementsService } from './movements.service';
import { RecategorizeMovementsDto } from './dto/recategorize-movements.dto';
import { FilterMovementDto } from './dto/filter-movement.dto';

const companyId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const periodId = '33333333-3333-4333-8333-333333333333';
const otherPeriodId = '44444444-4444-4444-8444-444444444444';
const category = (id: string, name: string, type = 'EXPENSE', company = companyId) => ({
  id,
  name,
  type,
  companyId: company,
});
const categories = [
  category('pending-expense', 'Productos no categorizados'),
  category('pending-income', 'Productos no categorizados', 'INCOME'),
  category('sales', 'Ingresos por Ventas', 'INCOME'),
  category('chosen', 'Servicios'),
  category('giro-category', 'Construcción'),
  category('foreign-default', 'Productos no categorizados', 'EXPENSE', 'foreign'),
];
const makeRule = (extra: Partial<CategoryRule> = {}): CategoryRule => ({
  id: 'rut-rule',
  name: 'Proveedor por RUT',
  companyId,
  priority: 1,
  ruleType: 'RUT',
  matchValue: '12.345.678-5',
  categoryId: 'chosen',
  movementType: 'BOTH',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...extra,
});
const party = { name: 'Horizonte', taxId: '123456785', giro: null as string | null };
const movement = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  companyId,
  categoryId: 'pending-expense',
  fiscalPeriodId: periodId,
  fiscalPeriod: { status: PeriodStatus.OPEN },
  counterparty: party as typeof party | null,
  type: 'EXPENSE' as MovementType,
  status: 'CONFIRMED',
  amount: 11900,
  description: 'Factura',
  reference: 'ref',
  date: new Date('2026-09-01'),
  updatedAt: new Date('2026-09-01'),
  updatedBy: 'original-user',
  ...extra,
});

function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'AND')
      return (condition as Record<string, unknown>[]).every((part) => matches(row, part));
    if (key === 'OR')
      return (condition as Record<string, unknown>[]).some((part) => matches(row, part));
    if (condition === undefined) return true;
    if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
      const op = condition as Record<string, unknown>;
      if ('in' in op) return (op.in as unknown[]).includes(row[key]);
      if ('notIn' in op) return !(op.notIn as unknown[]).includes(row[key]);
      if ('gt' in op) return String(row[key]) > String(op.gt);
      if ('contains' in op)
        return String(row[key]).toLowerCase().includes(String(op.contains).toLowerCase());
      if ('gte' in op && new Date(String(row[key])) < new Date(String(op.gte))) return false;
      if ('lte' in op && new Date(String(row[key])) > new Date(String(op.lte))) return false;
      return true;
    }
    return row[key] === condition;
  });
}

function setup(
  rows = [
    movement('01'),
    movement('02'),
    movement('03', { counterparty: null }),
    movement('04', { counterparty: { ...party, taxId: 'other' } }),
    movement('05', { categoryId: 'chosen' }),
    movement('06', { categoryId: 'sales', type: 'INCOME' }),
    movement('07', { companyId: 'foreign', categoryId: 'foreign-default' }),
    movement('08', { fiscalPeriodId: otherPeriodId }),
  ],
  rules = [makeRule()],
) {
  let inScope = false;
  let beforeWrite: (() => void) | undefined;
  const db = {
    category: {
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        categories.filter((c) => matches(c, where)),
      ),
      findFirst: jest.fn(
        async ({ where }: { where: Record<string, unknown> }) =>
          categories.find((c) => matches(c, where)) ?? null,
      ),
    },
    categoryRule: {
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        expect(inScope).toBe(true);
        expect(where.companyId).toBe(companyId);
        return rules.filter((r) => matches(r, where)).sort((a, b) => b.priority - a.priority);
      }),
    },
    movement: {
      findMany: jest.fn(
        async ({
          where,
          take,
          skip = 0,
        }: {
          where: Record<string, unknown>;
          take: number;
          skip?: number;
        }) => {
          expect(where.companyId).toBe(companyId);
          return rows
            .filter((r) => matches(r, where))
            .sort((a, b) => a.id.localeCompare(b.id))
            .slice(skip, skip + take)
            .map((r) => ({ ...r }));
        },
      ),
      count: jest.fn(
        async ({ where }: { where: Record<string, unknown> }) =>
          rows.filter((r) => matches(r, where)).length,
      ),
    },
    $executeRaw: jest.fn(async (strings: TemplateStringsArray, ...values: string[]) => {
      expect(inScope).toBe(true);
      expect(strings.join('?').replace(/\s+/g, ' ').trim()).toBe(
        'UPDATE movements SET "categoryId" = ?::uuid WHERE id = ?::uuid AND "companyId" = ?::uuid AND "categoryId" = ?::uuid AND "fiscalPeriodId" = ?::uuid',
      );
      const [target, id, company, originalCategory, fiscalPeriodId] = values;
      beforeWrite?.();
      beforeWrite = undefined;
      const row = rows.find(
        (r) =>
          r.id === id &&
          r.companyId === company &&
          r.categoryId === originalCategory &&
          r.fiscalPeriodId === fiscalPeriodId,
      );
      if (!row) return 0;
      row.categoryId = target;
      return 1;
    }),
  };
  const rls = {
    executeWithRls: jest.fn(
      async (company: string, user: string, fn: (tx: typeof db) => Promise<unknown>) => {
        expect([company, user]).toEqual([companyId, userId]);
        inScope = true;
        try {
          return await fn(db);
        } finally {
          inScope = false;
        }
      },
    ),
  };
  const matcher = new CategoryRulesService(
    db as unknown as PrismaService,
    rls as unknown as RlsService,
  );
  const service = new MovementRecategorizationService(rls as unknown as RlsService, matcher);
  const list = new MovementsService(db as unknown as PrismaService, rls as unknown as RlsService);
  return {
    rows,
    db,
    rls,
    service,
    list,
    setBeforeWrite: (fn: () => void) => {
      beforeWrite = fn;
    },
  };
}

describe('FIN-B recategorization', () => {
  it.each([true, false])(
    'skips and counts closed-period drafts before matching (dryRun=%s)',
    async (dryRun) => {
      const h = setup([
        movement('01', {
          status: MovementStatus.DRAFT,
          fiscalPeriod: { status: PeriodStatus.CLOSED },
        }),
        movement('02', {
          status: MovementStatus.DRAFT,
          fiscalPeriod: { status: PeriodStatus.CLOSED },
          counterparty: null,
        }),
      ]);
      const before = structuredClone(h.rows);
      expect(await h.service.recategorize(companyId, userId, { dryRun })).toEqual({
        candidates: 2,
        sinContraparte: 0,
        sinRegla: 0,
        periodoCerrado: 2,
        cambios: 0,
        porRegla: [],
        ...(dryRun ? {} : { aplicados: 0 }),
      });
      expect(h.rows).toEqual(before);
      expect(h.db.categoryRule.findMany).not.toHaveBeenCalled();
      expect(h.db.$executeRaw).not.toHaveBeenCalled();
      expect(h.db.movement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            status: true,
            fiscalPeriod: { select: { status: true } },
          }),
        }),
      );
    },
  );

  it.each([
    [MovementStatus.DRAFT, PeriodStatus.OPEN],
    [MovementStatus.DRAFT, PeriodStatus.IN_REVIEW],
    [MovementStatus.CONFIRMED, PeriodStatus.CLOSED],
    [MovementStatus.RECONCILED, PeriodStatus.CLOSED],
    [MovementStatus.CANCELLED, PeriodStatus.CLOSED],
  ])('keeps %s in %s eligible for category-only updates', async (status, periodStatus) => {
    const h = setup([movement('01', { status, fiscalPeriod: { status: periodStatus } })]);
    const before = structuredClone(h.rows[0]);
    const preview = await h.service.recategorize(companyId, userId, { dryRun: true });
    expect(preview).toMatchObject({ candidates: 1, periodoCerrado: 0, cambios: 1 });
    expect(h.db.$executeRaw).not.toHaveBeenCalled();
    expect(await h.service.recategorize(companyId, userId, { dryRun: false })).toEqual({
      ...preview,
      aplicados: 1,
    });
    expect(h.rows[0]).toEqual({ ...before, categoryId: 'chosen' });
  });

  it('dry run defaults to no writes, scopes company/period, and tallies one matcher by rule', async () => {
    const h = setup();
    const before = structuredClone(h.rows);
    const result = await h.service.recategorize(companyId, userId, {
      fiscalPeriodId: periodId,
    } as RecategorizeMovementsDto);
    expect(result).toEqual({
      candidates: 4,
      sinContraparte: 1,
      sinRegla: 1,
      periodoCerrado: 0,
      cambios: 2,
      porRegla: [
        {
          ruleId: 'rut-rule',
          ruleName: 'Proveedor por RUT',
          categoryId: 'chosen',
          categoryName: 'Servicios',
          count: 2,
        },
      ],
    });
    expect(h.rows).toEqual(before);
    expect(h.db.$executeRaw).not.toHaveBeenCalled();
    expect(h.db.categoryRule.findMany).toHaveBeenCalledTimes(3);
    expect(h.db.movement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          companyId,
          categoryId: { in: ['pending-expense', 'pending-income'] },
          fiscalPeriodId: periodId,
        },
        take: 200,
        orderBy: { id: 'asc' },
      }),
    );
  });

  it('applies exactly the preview matches, touches only categoryId and is idempotent', async () => {
    const h = setup();
    const before = structuredClone(h.rows);
    const preview = await h.service.recategorize(companyId, userId, { dryRun: true });
    const applied = await h.service.recategorize(companyId, userId, { dryRun: false });
    expect(applied).toEqual({ ...preview, aplicados: 3 });
    for (const [i, row] of h.rows.entries()) {
      expect(row).toEqual(
        ['01', '02', '08'].includes(row.id) ? { ...before[i], categoryId: 'chosen' } : before[i],
      );
    }
    expect(await h.service.recategorize(companyId, userId, { dryRun: false })).toMatchObject({
      aplicados: 0,
      cambios: 0,
    });
    expect(h.rls.executeWithRls).toHaveBeenCalledWith(companyId, userId, expect.any(Function));
  });

  it('keyset pages beyond 200 without skipping rows that leave the default category', async () => {
    const h = setup(Array.from({ length: 405 }, (_, i) => movement(String(i).padStart(4, '0'))));
    const preview = await h.service.recategorize(companyId, userId, { dryRun: true });
    expect(preview).toMatchObject({ candidates: 405, cambios: 405 });
    expect(h.db.movement.findMany).toHaveBeenCalledTimes(3);
    h.db.movement.findMany.mockClear();
    expect(await h.service.recategorize(companyId, userId, { dryRun: false })).toMatchObject({
      candidates: 405,
      aplicados: 405,
    });
    expect(h.db.movement.findMany.mock.calls.map(([a]) => a.where.id)).toEqual([
      undefined,
      { gt: '0199' },
      { gt: '0399' },
    ]);
    expect(h.rows.every((r) => r.categoryId === 'chosen')).toBe(true);
  });

  it('protects a manual category chosen after the candidate read', async () => {
    const h = setup([movement('01')]);
    h.setBeforeWrite(() => {
      h.rows[0].categoryId = 'manual-concurrent';
    });
    expect(await h.service.recategorize(companyId, userId, { dryRun: false })).toMatchObject({
      cambios: 1,
      aplicados: 0,
    });
    expect(h.rows[0].categoryId).toBe('manual-concurrent');
  });

  it('GIRO only matches stored giro; both default types qualify and sales income stays final', async () => {
    const h = setup(
      [
        movement('01', { counterparty: { ...party, giro: 'Construcción industrial' } }),
        movement('02'),
        movement('03', {
          categoryId: 'pending-income',
          type: 'INCOME',
          counterparty: { ...party, giro: 'CONSTRUCCION' },
        }),
        movement('04', {
          categoryId: 'sales',
          type: 'INCOME',
          counterparty: { ...party, giro: 'Construcción' },
        }),
      ],
      [
        makeRule({
          id: 'giro-rule',
          ruleType: 'GIRO',
          matchValue: 'construcción',
          categoryId: 'giro-category',
        }),
      ],
    );
    expect(await h.service.recategorize(companyId, userId, { dryRun: false })).toMatchObject({
      candidates: 3,
      sinRegla: 1,
      periodoCerrado: 0,
      cambios: 2,
      aplicados: 2,
    });
    expect(h.rows[1].counterparty?.giro).toBeNull();
    expect(h.rows[3].categoryId).toBe('sales');
  });

  it('does not write when the matched category is unchanged or belongs to another company', async () => {
    for (const target of ['pending-expense', 'foreign-default']) {
      const h = setup([movement('01')], [makeRule({ categoryId: target })]);
      expect(await h.service.recategorize(companyId, userId, { dryRun: false })).toMatchObject({
        cambios: 0,
        aplicados: 0,
      });
      expect(h.db.$executeRaw).not.toHaveBeenCalled();
    }
  });
});

describe('FIN-B list filter', () => {
  it.each([undefined, 'all', 'exclude', 'only'] as const)(
    'uncategorized=%s preserves the normal response and combines filters',
    async (uncategorized) => {
      const h = setup();
      const result = await h.list.findAll(companyId, { uncategorized, fiscalPeriodId: periodId });
      const expected =
        uncategorized === 'exclude'
          ? ['05', '06']
          : uncategorized === 'only'
            ? ['01', '02', '03', '04']
            : ['01', '02', '03', '04', '05', '06'];
      expect(result.data.map((r) => r.id)).toEqual(expected);
      expect(result).toMatchObject({ total: expected.length, page: 1, limit: 20, totalPages: 1 });
      if (!uncategorized || uncategorized === 'all')
        expect(h.db.category.findMany).not.toHaveBeenCalled();
      else
        expect(h.db.category.findMany).toHaveBeenCalledWith({
          where: {
            companyId,
            name: 'Productos no categorizados',
            type: { in: ['INCOME', 'EXPENSE'] },
          },
          select: { id: true },
        });
    },
  );
  it('only intersects rather than replaces an explicit categoryId and supports pagination/search', async () => {
    const h = setup();
    expect(
      (await h.list.findAll(companyId, { uncategorized: 'only', categoryId: 'chosen' })).total,
    ).toBe(0);
    const result = await h.list.findAll(companyId, {
      uncategorized: 'only',
      search: 'factura',
      fiscalPeriodId: periodId,
      type: 'EXPENSE',
      page: 2,
      limit: 2,
    });
    expect(result.data.map((r) => r.id)).toEqual(['03', '04']);
    expect(result.total).toBe(4);
  });
  it('handles companies without default categories without creating them', async () => {
    const h = setup();
    h.db.category.findMany.mockResolvedValue([]);
    expect((await h.list.findAll(companyId, { uncategorized: 'only' })).total).toBe(0);
    expect((await h.list.findAll(companyId, { uncategorized: 'exclude' })).total).toBe(7);
  });
});

describe('FIN-B DTO validation', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  it('defaults dryRun to true and accepts a UUID period', async () => {
    expect(
      await pipe.transform(
        { fiscalPeriodId: periodId },
        { type: 'body', metatype: RecategorizeMovementsDto },
      ),
    ).toMatchObject({ dryRun: true, fiscalPeriodId: periodId });
  });
  it.each([
    { dryRun: 'false' },
    { dryRun: null },
    { fiscalPeriodId: 'bad' },
    { dryRun: false, categoryId: 'chosen' },
  ])('rejects malformed bodies %j', async (body) => {
    await expect(
      pipe.transform(body, { type: 'body', metatype: RecategorizeMovementsDto }),
    ).rejects.toThrow(BadRequestException);
  });
  it('rejects invalid list modes', async () => {
    await expect(
      pipe.transform({ uncategorized: 'yes' }, { type: 'query', metatype: FilterMovementDto }),
    ).rejects.toThrow(BadRequestException);
  });
});
