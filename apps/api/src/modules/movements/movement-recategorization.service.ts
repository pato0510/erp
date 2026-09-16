import { Injectable } from '@nestjs/common';
import { MovementStatus, PeriodStatus } from '@prisma/client';
import { RlsService } from '../common/rls/rls.service';
import { resolveDefaultCategoryIds } from '../common/default-categories';
import { CategoryRulesService } from '../catalogs/category-rules.service';
import { RecategorizeMovementsDto } from './dto/recategorize-movements.dto';

interface RuleChanges {
  ruleId: string;
  ruleName: string;
  categoryId: string;
  categoryName: string;
  count: number;
}

export interface RecategorizationResult {
  candidates: number;
  sinContraparte: number;
  sinRegla: number;
  periodoCerrado: number;
  cambios: number;
  porRegla: RuleChanges[];
  aplicados?: number;
}

@Injectable()
export class MovementRecategorizationService {
  constructor(
    private readonly rlsService: RlsService,
    private readonly categoryRules: CategoryRulesService,
  ) {}

  async recategorize(
    companyId: string,
    userId: string,
    dto: RecategorizeMovementsDto,
  ): Promise<RecategorizationResult> {
    const dryRun = dto.dryRun !== false;
    const result: RecategorizationResult = {
      candidates: 0,
      sinContraparte: 0,
      sinRegla: 0,
      periodoCerrado: 0,
      cambios: 0,
      porRegla: [],
      ...(dryRun ? {} : { aplicados: 0 }),
    };
    const byRule = new Map<string, RuleChanges>();
    let lastId: string | undefined;

    for (;;) {
      const page = await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        const defaultIds = await resolveDefaultCategoryIds(companyId, tx);
        const candidates = await tx.movement.findMany({
          where: {
            companyId,
            categoryId: { in: defaultIds },
            ...(dto.fiscalPeriodId ? { fiscalPeriodId: dto.fiscalPeriodId } : {}),
            ...(lastId ? { id: { gt: lastId } } : {}),
          },
          orderBy: { id: 'asc' },
          take: 200,
          select: {
            id: true,
            categoryId: true,
            fiscalPeriodId: true,
            type: true,
            status: true,
            fiscalPeriod: { select: { status: true } },
            counterparty: { select: { name: true, taxId: true, giro: true } },
          },
        });
        for (const movement of candidates) {
          result.candidates++;
          // Mirror MovementsService.assertPeriodOpen: IN_REVIEW remains editable.
          if (
            movement.status === MovementStatus.DRAFT &&
            movement.fiscalPeriod.status === PeriodStatus.CLOSED
          ) {
            result.periodoCerrado++;
            continue;
          }
          if (!movement.counterparty) {
            result.sinContraparte++;
            continue;
          }
          const rule = await this.categoryRules.findMatchingRule(
            companyId,
            movement.counterparty,
            movement.type,
            tx,
          );
          if (!rule) {
            result.sinRegla++;
            continue;
          }
          if (rule.categoryId === movement.categoryId) continue;
          // Rules may outlive their destination category; never cross company boundaries.
          const category = await tx.category.findFirst({
            where: { id: rule.categoryId, companyId },
            select: { name: true },
          });
          if (!category) {
            result.sinRegla++;
            continue;
          }
          result.cambios++;
          const entry = byRule.get(rule.id) ?? {
            ruleId: rule.id,
            ruleName: rule.name,
            categoryId: rule.categoryId,
            categoryName: category.name,
            count: 0,
          };
          entry.count++;
          byRule.set(rule.id, entry);
          if (!dryRun) {
            // SQL changes ONLY categoryId (Prisma.update would also change @updatedAt).
            // Compare-and-set protects a manual category chosen since this page was read.
            // The existing audit_movements trigger captures the update with this RLS context.
            const count = await tx.$executeRaw`
              UPDATE movements SET "categoryId" = ${rule.categoryId}::uuid
              WHERE id = ${movement.id}::uuid
                AND "companyId" = ${companyId}::uuid
                AND "categoryId" = ${movement.categoryId}::uuid
                AND "fiscalPeriodId" = ${movement.fiscalPeriodId}::uuid
            `;
            result.aplicados = (result.aplicados ?? 0) + count;
          }
        }
        return { length: candidates.length, lastId: candidates.at(-1)?.id };
      });
      // Keyset pagination stays correct when applied rows leave the candidate set.
      if (page.length < 200) break;
      lastId = page.lastId;
    }
    result.porRegla = [...byRule.values()];
    return result;
  }
}
