import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CategoryRule,
  CategoryRuleMovementType,
  CategoryRuleType,
  MovementType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { RlsService } from '../common/rls/rls.service';
import { CreateCategoryRuleDto } from './dto/create-category-rule.dto';
import { UpdateCategoryRuleDto } from './dto/update-category-rule.dto';

export type CategoryRuleMatchableMovementType = MovementType;

@Injectable()
export class CategoryRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  async getRules(companyId: string): Promise<CategoryRule[]> {
    return this.prisma.categoryRule.findMany({
      where: { companyId, isActive: true },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async getAllRules(companyId: string): Promise<CategoryRule[]> {
    // Includes inactive rules — used by the management screen.
    return this.prisma.categoryRule.findMany({
      where: { companyId },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async findOne(id: string, companyId: string): Promise<CategoryRule> {
    const rule = await this.prisma.categoryRule.findFirst({ where: { id, companyId } });
    if (!rule) throw new NotFoundException('Category rule not found');
    return rule;
  }

  async createRule(
    companyId: string,
    userId: string,
    dto: CreateCategoryRuleDto,
  ): Promise<CategoryRule> {
    this.assertMatchValueShape(dto.ruleType, dto.matchValue);
    await this.assertCategoryBelongsToCompany(companyId, dto.categoryId);

    try {
      return await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.categoryRule.create({
          data: {
            companyId,
            name: dto.name,
            priority: dto.priority ?? 0,
            ruleType: dto.ruleType,
            matchValue: this.normalizeMatchValue(dto.ruleType, dto.matchValue),
            categoryId: dto.categoryId,
            movementType: dto.movementType,
            isActive: dto.isActive ?? true,
          },
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException(
          'Ya existe una regla con el mismo tipo, valor y dirección de movimiento.',
        );
      }
      throw err;
    }
  }

  async updateRule(
    id: string,
    companyId: string,
    userId: string,
    dto: UpdateCategoryRuleDto,
  ): Promise<CategoryRule> {
    const existing = await this.findOne(id, companyId);

    const ruleType = dto.ruleType ?? existing.ruleType;
    const matchValue = dto.matchValue ?? existing.matchValue;
    this.assertMatchValueShape(ruleType, matchValue);

    if (dto.categoryId) {
      await this.assertCategoryBelongsToCompany(companyId, dto.categoryId);
    }

    try {
      return await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.categoryRule.update({
          where: { id },
          data: {
            ...dto,
            matchValue:
              dto.matchValue !== undefined
                ? this.normalizeMatchValue(ruleType, dto.matchValue)
                : undefined,
          },
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException(
          'Ya existe una regla con el mismo tipo, valor y dirección de movimiento.',
        );
      }
      throw err;
    }
  }

  async deleteRule(id: string, companyId: string, userId: string): Promise<{ id: string }> {
    await this.findOne(id, companyId);
    await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      await tx.categoryRule.delete({ where: { id } });
    });
    return { id };
  }

  /**
   * Returns the categoryId chosen by the rules engine, or null if no rule
   * matches and the caller should fall back to its default category.
   *
   * Order:
   *  1. RUT exact-match (highest priority first)
   *  2. KEYWORD substring match on razonSocial (case-insensitive)
   * Each lookup is filtered to rules whose movementType matches the document
   * direction (INCOME / EXPENSE) or BOTH.
   */
  async applyRules(
    companyId: string,
    rut: string,
    razonSocial: string,
    movementType: CategoryRuleMatchableMovementType,
  ): Promise<string | null> {
    const movementFilter: CategoryRuleMovementType[] = [
      movementType === MovementType.INCOME
        ? CategoryRuleMovementType.INCOME
        : CategoryRuleMovementType.EXPENSE,
      CategoryRuleMovementType.BOTH,
    ];

    const rutMatch = await this.prisma.categoryRule.findFirst({
      where: {
        companyId,
        isActive: true,
        ruleType: CategoryRuleType.RUT,
        matchValue: rut,
        movementType: { in: movementFilter },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      select: { id: true, categoryId: true },
    });
    if (rutMatch) return rutMatch.categoryId;

    // Postgres `contains: insensitive` runs a case-insensitive LIKE — the
    // razonSocial is the search subject, so we check whether each rule's
    // matchValue is contained in it (rule.matchValue ⊂ razonSocial).
    // Pull all keyword rules and test in JS so the comparison matches the
    // ticket's spec exactly (razonSocial.toUpperCase().includes(matchValue.toUpperCase())).
    const keywordRules = await this.prisma.categoryRule.findMany({
      where: {
        companyId,
        isActive: true,
        ruleType: CategoryRuleType.KEYWORD,
        movementType: { in: movementFilter },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      select: { id: true, categoryId: true, matchValue: true },
    });
    const haystack = razonSocial.toUpperCase();
    for (const rule of keywordRules) {
      if (!rule.matchValue) continue;
      if (haystack.includes(rule.matchValue.toUpperCase())) {
        return rule.categoryId;
      }
    }

    return null;
  }

  /** Powers POST /api/category-rules/test in the UI. */
  async testRule(
    companyId: string,
    rut: string,
    razonSocial: string,
    movementType: MovementType,
  ): Promise<{
    matchedRule: CategoryRule | null;
    categoryId: string | null;
    categoryName: string | null;
  }> {
    const matchedCategoryId = await this.applyRules(companyId, rut, razonSocial, movementType);

    if (!matchedCategoryId) {
      return { matchedRule: null, categoryId: null, categoryName: null };
    }

    // Find the actual matched rule (re-running the same lookup) so the UI can
    // show the user *which* rule fired. Cheap: same query path, single row.
    const movementFilter: CategoryRuleMovementType[] = [
      movementType === MovementType.INCOME
        ? CategoryRuleMovementType.INCOME
        : CategoryRuleMovementType.EXPENSE,
      CategoryRuleMovementType.BOTH,
    ];

    const rutRule = await this.prisma.categoryRule.findFirst({
      where: {
        companyId,
        isActive: true,
        ruleType: CategoryRuleType.RUT,
        matchValue: rut,
        movementType: { in: movementFilter },
        categoryId: matchedCategoryId,
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });

    let matchedRule: CategoryRule | null = rutRule;
    if (!matchedRule) {
      const keywordRules = await this.prisma.categoryRule.findMany({
        where: {
          companyId,
          isActive: true,
          ruleType: CategoryRuleType.KEYWORD,
          movementType: { in: movementFilter },
          categoryId: matchedCategoryId,
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      });
      const haystack = razonSocial.toUpperCase();
      matchedRule =
        keywordRules.find((r) => r.matchValue && haystack.includes(r.matchValue.toUpperCase())) ??
        null;
    }

    const category = await this.prisma.category.findFirst({
      where: { id: matchedCategoryId, companyId },
      select: { name: true },
    });

    return {
      matchedRule,
      categoryId: matchedCategoryId,
      categoryName: category?.name ?? null,
    };
  }

  private assertMatchValueShape(ruleType: CategoryRuleType, matchValue: string | null | undefined) {
    if (ruleType === CategoryRuleType.DEFAULT) return;
    if (!matchValue || matchValue.trim() === '') {
      throw new BadRequestException('matchValue es obligatorio para reglas de tipo RUT o KEYWORD.');
    }
  }

  private normalizeMatchValue(ruleType: CategoryRuleType, matchValue: string | null | undefined) {
    if (ruleType === CategoryRuleType.DEFAULT) return null;
    return matchValue?.trim() ?? null;
  }

  private async assertCategoryBelongsToCompany(companyId: string, categoryId: string) {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, companyId },
      select: { id: true },
    });
    if (!category) {
      throw new BadRequestException('La categoría no existe en esta empresa.');
    }
  }
}
