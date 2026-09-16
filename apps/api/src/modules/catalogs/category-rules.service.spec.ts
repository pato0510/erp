import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CategoryRule, CategoryRuleType, MovementType, Prisma } from '@prisma/client';
import { CategoryRulesService } from './category-rules.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { RlsService } from '../common/rls/rls.service';
import { CreateCategoryRuleDto } from './dto/create-category-rule.dto';
import { UpdateCategoryRuleDto } from './dto/update-category-rule.dto';

const companyId = 'company-a';
const categoryId = '11111111-1111-4111-8111-111111111111';
const rule = (extra: Partial<CategoryRule> = {}): CategoryRule => ({
  id: 'rule',
  companyId,
  name: 'Servicios',
  priority: 1,
  ruleType: CategoryRuleType.KEYWORD,
  matchValue: null,
  categoryId,
  movementType: 'BOTH',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...extra,
});

function setup(rules: CategoryRule[]) {
  const tx = {
    categoryRule: {
      findMany: jest.fn().mockResolvedValue(rules),
      create: jest.fn(({ data }) => data),
      update: jest.fn(({ data }) => data),
    },
  };
  const prisma = {
    categoryRule: {
      findMany: jest.fn(() => {
        throw new Error('Escaped RLS transaction');
      }),
      findFirst: jest.fn().mockResolvedValue(rules[0]),
    },
    category: { findFirst: jest.fn().mockResolvedValue({ id: categoryId, name: 'Servicios' }) },
  };
  const rls = { executeWithRls: jest.fn(async (_company, _user, fn) => fn(tx)) };
  const service = new CategoryRulesService(
    prisma as unknown as PrismaService,
    rls as unknown as RlsService,
  );
  const apply = (facts: { taxId?: string | null; giro?: string | null; name?: string } | null) =>
    service.applyRules(
      companyId,
      facts,
      MovementType.EXPENSE,
      tx as unknown as Prisma.TransactionClient,
    );
  return { service, apply, tx, prisma, rls };
}

describe('FIN-A single-criterion rules', () => {
  it.each([
    ['16.498.012-K', '16498012k'],
    ['16498012k', '16.498.012-K'],
    ['12.345.678-5', '123456785'],
  ])('normalizes both sides of exact RUT (%s / %s)', async (expected, actual) => {
    const { apply } = setup([rule({ ruleType: 'RUT', matchValue: expected })]);
    expect(await apply({ taxId: actual })).toBe(categoryId);
    expect(await apply({ taxId: '11.111.111-1' })).toBeNull();
    expect(await apply({ taxId: null })).toBeNull();
  });

  it.each(['construccion', 'CONSTRUCCIÓN', 'Construccio\u0301n'])(
    'matches GIRO with case/accent variants (%s)',
    async (matchValue) => {
      const { apply } = setup([rule({ ruleType: 'GIRO', matchValue })]);
      expect(await apply({ giro: 'Servicios de Construcción industrial' })).toBe(categoryId);
      expect(await apply({ giro: 'Comercio minorista' })).toBeNull();
      expect(await apply({ giro: null })).toBeNull();
      expect(await apply(null)).toBeNull();
    },
  );

  it('ranks RUT above GIRO above KEYWORD regardless of cross-type priority', async () => {
    const { apply, tx, prisma } = setup([
      rule({ id: 'keyword', matchValue: 'Servicios', categoryId: 'keyword', priority: 100 }),
      rule({
        id: 'giro',
        ruleType: 'GIRO',
        matchValue: 'construccion',
        categoryId: 'giro',
        priority: 50,
      }),
      rule({
        id: 'rut',
        ruleType: 'RUT',
        matchValue: '12345678-5',
        categoryId: 'rut',
        priority: 1,
      }),
    ]);
    const facts = { taxId: '12.345.678-5', name: 'Servicios Horizonte', giro: 'Construcción' };
    expect(await apply(facts)).toBe('rut');
    expect(await apply({ ...facts, taxId: null })).toBe('giro');
    expect(await apply({ ...facts, taxId: null, giro: null })).toBe('keyword');
    expect(await apply({ ...facts, taxId: null, giro: 'Comercio' })).toBe('keyword');
    expect(tx.categoryRule.findMany).toHaveBeenCalledWith({
      where: { companyId, isActive: true, movementType: { in: ['EXPENSE', 'BOTH'] } },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
    expect(prisma.categoryRule.findMany).not.toHaveBeenCalled();
  });

  it('preserves query priority/creation order within GIRO and ignores DEFAULT', async () => {
    const { apply } = setup([
      rule({ ruleType: 'DEFAULT', matchValue: 'Construcción', priority: 1000 }),
      rule({ ruleType: 'GIRO', matchValue: 'construccion', categoryId: 'first', priority: 2 }),
      rule({ ruleType: 'GIRO', matchValue: 'industrial', categoryId: 'second', priority: 1 }),
    ]);
    expect(await apply({ giro: 'Construcción industrial' })).toBe('first');
    expect(
      await setup([rule({ ruleType: 'DEFAULT', matchValue: 'Construcción' })]).apply({
        giro: 'Construcción',
      }),
    ).toBeNull();
  });

  it('persists a trimmed GIRO matchValue on the RLS transaction', async () => {
    const { service, tx, rls } = setup([]);
    await service.createRule(companyId, 'user-a', {
      name: 'Giro',
      categoryId,
      ruleType: 'GIRO',
      movementType: 'BOTH',
      matchValue: ' Construcción ',
    });
    expect(rls.executeWithRls).toHaveBeenCalledWith(companyId, 'user-a', expect.any(Function));
    expect(tx.categoryRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ ruleType: 'GIRO', matchValue: 'Construcción' }),
    });
  });

  it.each(['RUT', 'GIRO', 'KEYWORD'] as const)(
    '%s requires matchValue on create and PATCH',
    async (ruleType) => {
      const { service } = setup([rule({ ruleType, matchValue: 'Servicios' })]);
      for (const matchValue of [undefined, null, '', '   ', 'x'.repeat(201)]) {
        await expect(
          service.createRule(companyId, 'user-a', {
            name: 'Regla',
            categoryId,
            ruleType,
            movementType: 'BOTH',
            matchValue,
          }),
        ).rejects.toThrow(BadRequestException);
        if (matchValue !== undefined) {
          await expect(
            service.updateRule('rule', companyId, 'user-a', { matchValue }),
          ).rejects.toThrow(BadRequestException);
        }
      }
    },
  );

  it('PATCH preserves the criterion when omitted, trims replacements, rejects an empty type switch', async () => {
    const { service, tx } = setup([rule({ ruleType: 'GIRO', matchValue: 'Construcción' })]);
    await service.updateRule('rule', companyId, 'user-a', { priority: 5 });
    expect(tx.categoryRule.update).toHaveBeenLastCalledWith({
      where: { id: 'rule' },
      data: { priority: 5, matchValue: 'Construcción' },
    });
    await service.updateRule('rule', companyId, 'user-a', { matchValue: ' Comercio ' });
    expect(tx.categoryRule.update).toHaveBeenLastCalledWith({
      where: { id: 'rule' },
      data: { matchValue: 'Comercio' },
    });
    const legacy = setup([rule({ ruleType: 'DEFAULT', matchValue: null })]);
    await expect(
      legacy.service.updateRule('rule', companyId, 'user-a', { ruleType: 'GIRO' }),
    ).rejects.toThrow('Ingresa el texto del giro a buscar.');
  });

  it('the test endpoint uses the same GIRO matcher as ingestion', async () => {
    const { service, prisma, tx } = setup([rule({ ruleType: 'GIRO', matchValue: 'CONSTRUCCION' })]);
    prisma.categoryRule.findMany = tx.categoryRule.findMany;
    const result = await service.testRule(
      companyId,
      '12.345.678-5',
      'Servicios',
      'EXPENSE',
      'Construcción',
    );
    expect(result.matchedRule?.id).toBe('rule');
    expect(result.categoryId).toBe(categoryId);
  });
});

describe('FIN-A GIRO matchValue validation', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true });
  const base = { name: 'Giro', categoryId, ruleType: 'GIRO', movementType: 'BOTH' };
  for (const metatype of [CreateCategoryRuleDto, UpdateCategoryRuleDto]) {
    it.each([' Construcción ', 'x', 'x'.repeat(200)])(
      `${metatype.name} accepts and trims valid values`,
      async (matchValue) => {
        const dto = await pipe.transform({ ...base, matchValue }, { type: 'body', metatype });
        expect(dto.matchValue).toBe(matchValue.trim());
      },
    );
    it.each(['', '   ', 'x'.repeat(201), 123])(
      `${metatype.name} rejects invalid values`,
      async (matchValue) => {
        await expect(
          pipe.transform({ ...base, matchValue }, { type: 'body', metatype }),
        ).rejects.toThrow(BadRequestException);
      },
    );
  }
  it.each([null, undefined])('create requires GIRO matchValue (%s)', async (matchValue) => {
    await expect(
      pipe.transform({ ...base, matchValue }, { type: 'body', metatype: CreateCategoryRuleDto }),
    ).rejects.toThrow(BadRequestException);
  });
  it('PATCH without matchValue is allowed; the service validates the merged rule', async () => {
    await expect(
      pipe.transform({ priority: 2 }, { type: 'body', metatype: UpdateCategoryRuleDto }),
    ).resolves.toBeInstanceOf(UpdateCategoryRuleDto);
  });
  it('removes the obsolete parallel criteria from the request', async () => {
    const dto = await pipe.transform(
      { ...base, matchValue: 'Comercio', rut: '123456785', giroContains: 'otro' },
      { type: 'body', metatype: CreateCategoryRuleDto },
    );
    expect(dto).not.toHaveProperty('rut');
    expect(dto).not.toHaveProperty('giroContains');
  });
});
