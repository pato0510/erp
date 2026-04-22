import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { RlsService } from '../common/rls/rls.service';

export interface UpsertGoalsDto {
  year: number;
  incomeGoal?: number | null;
  expenseLimit?: number | null;
}

@Injectable()
export class GoalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  async getGoals(companyId: string, year: number) {
    return this.prisma.companyGoal.findFirst({
      where: { companyId, year },
    });
  }

  async upsertGoals(companyId: string, userId: string, dto: UpsertGoalsDto) {
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.companyGoal.upsert({
        where: { companyId_year: { companyId, year: dto.year } },
        update: {
          incomeGoal: dto.incomeGoal ?? null,
          expenseLimit: dto.expenseLimit ?? null,
        },
        create: {
          companyId,
          year: dto.year,
          incomeGoal: dto.incomeGoal ?? null,
          expenseLimit: dto.expenseLimit ?? null,
        },
      });
    });
  }
}
