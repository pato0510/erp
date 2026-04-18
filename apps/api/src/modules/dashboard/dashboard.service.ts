import { Injectable, NotFoundException } from '@nestjs/common';
import { MovementStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardData(companyId: string, fiscalPeriodId?: string) {
    // Resolve fiscal period
    let period;
    if (fiscalPeriodId) {
      period = await this.prisma.fiscalPeriod.findFirst({
        where: { id: fiscalPeriodId, companyId },
      });
    } else {
      const now = new Date();
      period = await this.prisma.fiscalPeriod.findFirst({
        where: { companyId, year: now.getFullYear(), month: now.getMonth() + 1 },
      });
    }
    if (!period) throw new NotFoundException('Fiscal period not found');

    const periodId = period.id;

    // Run all queries in parallel
    const [
      incomeAgg,
      expenseAgg,
      confirmedCount,
      draftCount,
      balances,
      pendingCommitments,
      topExpenseCategories,
      topIncomeCategories,
      recentMovements,
      upcomingCommitments,
    ] = await Promise.all([
      // Income
      this.prisma.movement.aggregate({
        where: {
          companyId,
          fiscalPeriodId: periodId,
          type: 'INCOME',
          status: MovementStatus.CONFIRMED,
        },
        _sum: { amount: true },
      }),
      // Expense
      this.prisma.movement.aggregate({
        where: {
          companyId,
          fiscalPeriodId: periodId,
          type: 'EXPENSE',
          status: MovementStatus.CONFIRMED,
        },
        _sum: { amount: true },
      }),
      // Confirmed count
      this.prisma.movement.count({
        where: { companyId, fiscalPeriodId: periodId, status: MovementStatus.CONFIRMED },
      }),
      // Draft count
      this.prisma.movement.count({
        where: { companyId, fiscalPeriodId: periodId, status: 'DRAFT' },
      }),
      // Opening balances
      this.prisma.accountBalance.findMany({
        where: { companyId, fiscalPeriodId: periodId },
      }),
      // Pending commitments aggregate
      this.prisma.commitment.aggregate({
        where: { companyId, fiscalPeriodId: periodId, status: 'PENDING' },
        _sum: { amount: true },
        _count: true,
      }),
      // Top expense categories
      this.prisma.movement.groupBy({
        by: ['categoryId'],
        where: {
          companyId,
          fiscalPeriodId: periodId,
          type: 'EXPENSE',
          status: MovementStatus.CONFIRMED,
        },
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'desc' } },
        take: 5,
      }),
      // Top income categories
      this.prisma.movement.groupBy({
        by: ['categoryId'],
        where: {
          companyId,
          fiscalPeriodId: periodId,
          type: 'INCOME',
          status: MovementStatus.CONFIRMED,
        },
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'desc' } },
        take: 5,
      }),
      // Recent movements
      this.prisma.movement.findMany({
        where: { companyId, fiscalPeriodId: periodId, status: MovementStatus.CONFIRMED },
        include: {
          category: { select: { name: true, color: true } },
          counterparty: { select: { name: true } },
        },
        orderBy: { date: 'desc' },
        take: 5,
      }),
      // Upcoming commitments
      this.prisma.commitment.findMany({
        where: {
          companyId,
          status: 'PENDING',
          dueDate: {
            gte: new Date(),
            lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        },
        include: {
          counterparty: { select: { name: true } },
          category: { select: { name: true } },
        },
        orderBy: { dueDate: 'asc' },
      }),
    ]);

    const totalIncome = Number(incomeAgg._sum.amount || 0);
    const totalExpense = Number(expenseAgg._sum.amount || 0);
    const openingBalance = balances.reduce((s, b) => s + Number(b.openingBalance), 0);
    const totalCash = openingBalance + totalIncome - totalExpense;
    const committedAmount = Number(pendingCommitments._sum.amount || 0);

    // Resolve category names for top categories
    const categoryIds = [
      ...topExpenseCategories.map((c) => c.categoryId),
      ...topIncomeCategories.map((c) => c.categoryId),
    ];
    const categories =
      categoryIds.length > 0
        ? await this.prisma.category.findMany({
            where: { id: { in: categoryIds } },
            select: { id: true, name: true, color: true },
          })
        : [];
    const catMap = new Map(categories.map((c) => [c.id, c]));

    const mapCategoryTotals = (groups: typeof topExpenseCategories, grandTotal: number) =>
      groups.map((g) => ({
        categoryName: catMap.get(g.categoryId)?.name || 'Unknown',
        color: catMap.get(g.categoryId)?.color || '#888',
        total: Number(g._sum.amount || 0),
        percentage:
          grandTotal > 0 ? Math.round((Number(g._sum.amount || 0) / grandTotal) * 100) : 0,
      }));

    return {
      period: {
        id: period.id,
        name: period.name,
        year: period.year,
        month: period.month,
        status: period.status,
      },
      cash: {
        totalCash,
        freeCash: totalCash - committedAmount,
        committedAmount,
        openingBalance,
      },
      movements: {
        totalIncome,
        totalExpense,
        balance: totalIncome - totalExpense,
        confirmedCount,
        draftCount,
      },
      commitments: {
        upcoming: upcomingCommitments,
        totalPending: pendingCommitments._count,
        totalPendingAmount: committedAmount,
      },
      categories: {
        topExpenses: mapCategoryTotals(topExpenseCategories, totalExpense),
        topIncome: mapCategoryTotals(topIncomeCategories, totalIncome),
      },
      recentMovements,
    };
  }
}
