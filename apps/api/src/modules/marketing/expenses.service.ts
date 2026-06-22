import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  /** List expenses with the (denormalized) campaign + Finance category names. */
  async findAll(companyId: string) {
    const expenses = await this.prisma.marketingExpense.findMany({
      where: { companyId },
      orderBy: { date: 'desc' },
      include: { campaign: { select: { id: true, name: true } } },
    });
    return expenses.map((e) => ({
      id: e.id,
      amount: Number(e.amount),
      date: e.date,
      description: e.description,
      channel: e.channel,
      campaignId: e.campaignId,
      campaignName: e.campaign?.name ?? null,
      financeCategoryId: e.financeCategoryId,
      financeCategoryName: e.financeCategoryName,
    }));
  }

  async create(companyId: string, dto: CreateExpenseDto) {
    // If a campaign is referenced, it must belong to this company.
    if (dto.campaignId) {
      const campaign = await this.prisma.marketingCampaign.findFirst({
        where: { id: dto.campaignId, companyId },
        select: { id: true },
      });
      if (!campaign) throw new BadRequestException('Campaña no encontrada para esta empresa.');
    }

    return this.prisma.marketingExpense.create({
      data: {
        companyId,
        amount: new Prisma.Decimal(dto.amount),
        date: new Date(dto.date),
        description: dto.description,
        channel: dto.channel ?? null,
        campaignId: dto.campaignId ?? null,
        // Plain display copies — never a FK / movement into Finance.
        financeCategoryId: dto.financeCategoryId ?? null,
        financeCategoryName: dto.financeCategoryName ?? null,
      },
    });
  }

  async remove(id: string, companyId: string) {
    const expense = await this.prisma.marketingExpense.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!expense) throw new NotFoundException('Gasto no encontrado');
    await this.prisma.marketingExpense.delete({ where: { id } });
    return { id, deleted: true };
  }
}
