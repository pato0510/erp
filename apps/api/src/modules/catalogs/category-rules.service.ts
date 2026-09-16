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
import { cleanRut } from '@erp/utils';
import { CounterpartyFactSource, resolveCounterpartyFacts } from '../common/counterparty-facts';

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
    const matchValue = dto.matchValue !== undefined ? dto.matchValue : existing.matchValue;
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
            matchValue: this.normalizeMatchValue(ruleType, matchValue),
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

  /** RUT → GIRO → KEYWORD, with priority/creation order within each type.
   * tx keeps sync reads on the RLS-scoped connection; DEFAULT is not evaluated. */
  async applyRules(
    companyId: string,
    counterparty: CounterpartyFactSource | null,
    movementType: CategoryRuleMatchableMovementType,
    tx?: Prisma.TransactionClient,
  ): Promise<string | null> {
    const rule = await this.findMatchingRule(companyId, counterparty, movementType, tx);
    return rule?.categoryId ?? null;
  }

  private async findMatchingRule(
    companyId: string,
    counterparty: CounterpartyFactSource | null,
    movementType: MovementType,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<CategoryRule | null> {
    const rules = await tx.categoryRule.findMany({
      where: {
        companyId,
        isActive: true,
        movementType: { in: [movementType, CategoryRuleMovementType.BOTH] },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
    const facts = resolveCounterpartyFacts(counterparty);
    for (const type of [CategoryRuleType.RUT, CategoryRuleType.GIRO, CategoryRuleType.KEYWORD]) {
      for (const rule of rules) {
        const value = rule.matchValue?.trim();
        if (rule.ruleType !== type || !value) continue;
        if (type === CategoryRuleType.RUT) {
          if (facts.rut && cleanRut(value) && cleanRut(facts.rut) === cleanRut(value)) return rule;
        } else if (type === CategoryRuleType.GIRO) {
          const normalized = this.normalizeGiro(value);
          if (facts.giro && normalized && this.normalizeGiro(facts.giro).includes(normalized))
            return rule;
        } else if (facts.name?.toUpperCase().includes(value.toUpperCase())) {
          return rule;
        }
      }
    }
    return null;
  }

  private normalizeGiro(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es-CL')
      .trim();
  }

  /** The test endpoint uses exactly the matcher used by the SII ingest. */
  async testRule(
    companyId: string,
    rut: string,
    razonSocial: string,
    movementType: MovementType,
    giro?: string,
  ): Promise<{
    matchedRule: CategoryRule | null;
    categoryId: string | null;
    categoryName: string | null;
  }> {
    const matchedRule = await this.findMatchingRule(
      companyId,
      { taxId: rut, name: razonSocial, giro },
      movementType,
    );
    if (!matchedRule) return { matchedRule: null, categoryId: null, categoryName: null };
    const category = await this.prisma.category.findFirst({
      where: { id: matchedRule.categoryId, companyId },
      select: { name: true },
    });
    return {
      matchedRule,
      categoryId: matchedRule.categoryId,
      categoryName: category?.name ?? null,
    };
  }

  private assertMatchValueShape(ruleType: CategoryRuleType, matchValue: string | null | undefined) {
    if (ruleType === CategoryRuleType.DEFAULT) return;
    if (!matchValue?.trim()) {
      throw new BadRequestException(
        ruleType === CategoryRuleType.GIRO
          ? 'Ingresa el texto del giro a buscar.'
          : 'Ingresa un valor de coincidencia para la regla.',
      );
    }
    if (matchValue.trim().length > 200) {
      throw new BadRequestException(
        'El valor de coincidencia no puede superar los 200 caracteres.',
      );
    }
  }

  private normalizeMatchValue(ruleType: CategoryRuleType, matchValue: string | null | undefined) {
    if (ruleType === CategoryRuleType.DEFAULT) return null;
    return matchValue?.trim() || null;
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
