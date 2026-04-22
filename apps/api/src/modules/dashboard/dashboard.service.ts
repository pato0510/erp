import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MovementStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AlertsService } from '../alerts/alerts.service';
import { TaxService } from '../tax/tax.service';
import { ReconciliationService } from '../reconciliation/reconciliation.service';
import { GoalsService } from './goals.service';

const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

// Each section has a default shape so the dashboard contract stays stable
// even when one of its data sources fails. The frontend can render a
// degraded state without null-checking every field.
const DEFAULT_CASH = { totalCash: 0, freeCash: 0, committedAmount: 0, openingBalance: 0 };
const DEFAULT_MOVEMENTS = {
  totalIncome: 0,
  totalExpense: 0,
  balance: 0,
  confirmedCount: 0,
  draftCount: 0,
};
const DEFAULT_COMMITMENTS = {
  upcoming: [] as unknown[],
  totalPending: 0,
  totalPendingAmount: 0,
};
const DEFAULT_CATEGORIES = {
  topExpenses: [] as unknown[],
  topIncome: [] as unknown[],
};
const DEFAULT_RECENT_MOVEMENTS: unknown[] = [];
const DEFAULT_ALERTS = {
  critical: 0,
  warning: 0,
  info: 0,
  total: 0,
  items: [] as unknown[],
};
const DEFAULT_TAX = {
  emitidosTotal: 0,
  recibidosTotal: 0,
  balance: 0,
  pendingReconciliation: 0,
};
const DEFAULT_RECONCILIATION = {
  reconciledPercentage: 0,
  pendingCount: 0,
  suggestedCount: 0,
  totalDiscrepancyAmount: 0,
  totalBankMovements: 0,
  reconciledBankMovements: 0,
};

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly alertsService: AlertsService,
    private readonly taxService: TaxService,
    private readonly reconciliationService: ReconciliationService,
    private readonly goalsService: GoalsService,
  ) {}

  async getAnnualData(companyId: string, year: number) {
    // Aggregations live on the fiscal period, not on the movement's physical
    // date. A movement booked against period 2026-03 belongs to March of 2026
    // even if its `date` is April 5th. We still select date/fiscalPeriod so the
    // client keeps both pieces of info.
    const annualWhere = {
      companyId,
      status: MovementStatus.CONFIRMED,
      fiscalPeriod: { year },
    };

    this.logger.log(`getAnnualData company=${companyId} year=${year} (by fiscalPeriod.year)`);

    // Each data source is isolated so one failing query (e.g., a missing
    // company_goals table on an un-migrated DB) cannot 500 the whole endpoint.
    const [grouped, goals, expenseGroups, incomeGroups] = await Promise.all([
      this.prisma.movement
        .findMany({
          where: { ...annualWhere, type: { in: ['INCOME', 'EXPENSE'] } },
          select: {
            amount: true,
            type: true,
            date: true,
            fiscalPeriod: { select: { month: true } },
          },
        })
        .catch((err) => {
          this.logger.error(
            `annual: movement.findMany failed: ${err instanceof Error ? err.stack : err}`,
          );
          return [] as {
            amount: unknown;
            type: 'INCOME' | 'EXPENSE';
            date: Date;
            fiscalPeriod: { month: number };
          }[];
        }),
      this.goalsService.getGoals(companyId, year).catch((err) => {
        this.logger.error(
          `annual: goalsService.getGoals failed (table missing?): ${err instanceof Error ? err.stack : err}`,
        );
        return null;
      }),
      this.prisma.movement
        .groupBy({
          by: ['categoryId'],
          where: { ...annualWhere, type: 'EXPENSE' },
          _sum: { amount: true },
          orderBy: { _sum: { amount: 'desc' } },
          take: 5,
        })
        .catch((err) => {
          this.logger.error(
            `annual: expense groupBy failed: ${err instanceof Error ? err.stack : err}`,
          );
          return [] as { categoryId: string; _sum: { amount: unknown } }[];
        }),
      this.prisma.movement
        .groupBy({
          by: ['categoryId'],
          where: { ...annualWhere, type: 'INCOME' },
          _sum: { amount: true },
          orderBy: { _sum: { amount: 'desc' } },
          take: 5,
        })
        .catch((err) => {
          this.logger.error(
            `annual: income groupBy failed: ${err instanceof Error ? err.stack : err}`,
          );
          return [] as { categoryId: string; _sum: { amount: unknown } }[];
        }),
    ]);

    this.logger.log(
      `getAnnualData company=${companyId} year=${year} rows=${grouped.length} expenseGroups=${expenseGroups.length} incomeGroups=${incomeGroups.length}`,
    );

    const monthly = Array.from({ length: 12 }, () => ({ income: 0, expense: 0, hasData: false }));
    for (const m of grouped) {
      const monthIdx = m.fiscalPeriod.month - 1;
      if (monthIdx < 0 || monthIdx > 11) continue;
      const bucket = monthly[monthIdx];
      const value = Number(m.amount);
      if (m.type === 'INCOME') bucket.income += value;
      else bucket.expense += value;
      bucket.hasData = true;
    }

    const months = monthly.map((b, idx) => {
      const margin = b.income > 0 ? ((b.income - b.expense) / b.income) * 100 : 0;
      return {
        month: idx + 1,
        name: MONTH_NAMES[idx],
        income: b.income,
        expense: b.expense,
        margin: Math.round(margin * 10) / 10,
        hasData: b.hasData,
      };
    });

    const totalIncome = months.reduce((s, m) => s + m.income, 0);
    const totalExpense = months.reduce((s, m) => s + m.expense, 0);
    const totalMargin = totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome) * 100 : 0;
    const incomeGoal = goals?.incomeGoal ? Number(goals.incomeGoal) : 0;
    const expenseLimit = goals?.expenseLimit ? Number(goals.expenseLimit) : 0;

    const categoryIds = [
      ...expenseGroups.map((g) => g.categoryId),
      ...incomeGroups.map((g) => g.categoryId),
    ];
    const categoryRows =
      categoryIds.length > 0
        ? await this.prisma.category.findMany({
            where: { id: { in: categoryIds } },
            select: { id: true, name: true },
          })
        : [];
    const categoryName = new Map(categoryRows.map((c) => [c.id, c.name]));
    const categoriesBreakdown = (
      groups: typeof expenseGroups,
      grandTotal: number,
    ): { categoryName: string; total: number; percentage: number }[] =>
      groups.map((g) => {
        const total = Number(g._sum.amount || 0);
        return {
          categoryName: categoryName.get(g.categoryId) || 'Sin categoría',
          total,
          percentage: grandTotal > 0 ? Math.round((total / grandTotal) * 100) : 0,
        };
      });

    return {
      year,
      goals: goals
        ? {
            incomeGoal: goals.incomeGoal ? Number(goals.incomeGoal) : null,
            expenseLimit: goals.expenseLimit ? Number(goals.expenseLimit) : null,
          }
        : null,
      months,
      totals: {
        income: totalIncome,
        expense: totalExpense,
        margin: Math.round(totalMargin * 10) / 10,
        result: totalIncome - totalExpense,
        incomeVsGoal: incomeGoal > 0 ? Math.round((totalIncome / incomeGoal) * 1000) / 10 : 0,
        expenseVsLimit:
          expenseLimit > 0 ? Math.round((totalExpense / expenseLimit) * 1000) / 10 : 0,
      },
      categories: {
        topExpenses: categoriesBreakdown(expenseGroups, totalExpense),
        topIncome: categoriesBreakdown(incomeGroups, totalIncome),
      },
    };
  }

  async getDashboardData(companyId: string, fiscalPeriodId?: string) {
    // Resolving the period is the only step that must succeed — without one
    // the dashboard has no reference to pivot around. Everything else below
    // has its own error boundary.
    const period = await this.resolvePeriod(companyId, fiscalPeriodId);
    const periodId = period.id;

    const [cash, movements, commitments, categories, recentMovements, alerts, tax, reconciliation] =
      await Promise.all([
        this.safeCash(companyId, periodId),
        this.safeMovements(companyId, periodId),
        this.safeCommitments(companyId, periodId),
        this.safeCategories(companyId, periodId),
        this.safeRecentMovements(companyId, periodId),
        this.safeAlerts(companyId),
        this.safeTax(companyId, periodId),
        this.safeReconciliation(companyId, periodId),
      ]);

    return {
      period: {
        id: period.id,
        name: period.name,
        year: period.year,
        month: period.month,
        status: period.status,
      },
      cash,
      movements,
      commitments,
      categories,
      recentMovements,
      alerts,
      tax,
      reconciliation,
    };
  }

  // ──────────────────── Per-section fetchers ────────────────────

  private async resolvePeriod(companyId: string, fiscalPeriodId?: string) {
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
    return period;
  }

  private async safeCash(companyId: string, fiscalPeriodId: string) {
    try {
      const [incomeAgg, expenseAgg, balances, pendingCommitments] = await Promise.all([
        this.prisma.movement.aggregate({
          where: {
            companyId,
            fiscalPeriodId,
            type: 'INCOME',
            status: MovementStatus.CONFIRMED,
          },
          _sum: { amount: true },
        }),
        this.prisma.movement.aggregate({
          where: {
            companyId,
            fiscalPeriodId,
            type: 'EXPENSE',
            status: MovementStatus.CONFIRMED,
          },
          _sum: { amount: true },
        }),
        this.prisma.accountBalance.findMany({
          where: { companyId, fiscalPeriodId },
        }),
        this.prisma.commitment.aggregate({
          where: { companyId, fiscalPeriodId, status: 'PENDING' },
          _sum: { amount: true },
        }),
      ]);

      const totalIncome = Number(incomeAgg._sum.amount || 0);
      const totalExpense = Number(expenseAgg._sum.amount || 0);
      const openingBalance = balances.reduce((s, b) => s + Number(b.openingBalance), 0);
      const totalCash = openingBalance + totalIncome - totalExpense;
      const committedAmount = Number(pendingCommitments._sum.amount || 0);

      return {
        totalCash,
        freeCash: totalCash - committedAmount,
        committedAmount,
        openingBalance,
      };
    } catch (err) {
      this.logger.error(`Cash section failed: ${err instanceof Error ? err.message : err}`);
      return { ...DEFAULT_CASH };
    }
  }

  private async safeMovements(companyId: string, fiscalPeriodId: string) {
    try {
      const [incomeAgg, expenseAgg, confirmedCount, draftCount] = await Promise.all([
        this.prisma.movement.aggregate({
          where: {
            companyId,
            fiscalPeriodId,
            type: 'INCOME',
            status: MovementStatus.CONFIRMED,
          },
          _sum: { amount: true },
        }),
        this.prisma.movement.aggregate({
          where: {
            companyId,
            fiscalPeriodId,
            type: 'EXPENSE',
            status: MovementStatus.CONFIRMED,
          },
          _sum: { amount: true },
        }),
        this.prisma.movement.count({
          where: { companyId, fiscalPeriodId, status: MovementStatus.CONFIRMED },
        }),
        this.prisma.movement.count({
          where: { companyId, fiscalPeriodId, status: 'DRAFT' },
        }),
      ]);

      const totalIncome = Number(incomeAgg._sum.amount || 0);
      const totalExpense = Number(expenseAgg._sum.amount || 0);

      return {
        totalIncome,
        totalExpense,
        balance: totalIncome - totalExpense,
        confirmedCount,
        draftCount,
      };
    } catch (err) {
      this.logger.error(`Movements section failed: ${err instanceof Error ? err.message : err}`);
      return { ...DEFAULT_MOVEMENTS };
    }
  }

  private async safeCommitments(companyId: string, fiscalPeriodId: string) {
    try {
      const [pendingAgg, upcoming] = await Promise.all([
        this.prisma.commitment.aggregate({
          where: { companyId, fiscalPeriodId, status: 'PENDING' },
          _sum: { amount: true },
          _count: true,
        }),
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

      return {
        upcoming,
        totalPending: pendingAgg._count,
        totalPendingAmount: Number(pendingAgg._sum.amount || 0),
      };
    } catch (err) {
      this.logger.error(`Commitments section failed: ${err instanceof Error ? err.message : err}`);
      return { ...DEFAULT_COMMITMENTS };
    }
  }

  private async safeCategories(companyId: string, fiscalPeriodId: string) {
    try {
      const [topExpenseCategories, topIncomeCategories, incomeAgg, expenseAgg] = await Promise.all([
        this.prisma.movement.groupBy({
          by: ['categoryId'],
          where: {
            companyId,
            fiscalPeriodId,
            type: 'EXPENSE',
            status: MovementStatus.CONFIRMED,
          },
          _sum: { amount: true },
          orderBy: { _sum: { amount: 'desc' } },
          take: 5,
        }),
        this.prisma.movement.groupBy({
          by: ['categoryId'],
          where: {
            companyId,
            fiscalPeriodId,
            type: 'INCOME',
            status: MovementStatus.CONFIRMED,
          },
          _sum: { amount: true },
          orderBy: { _sum: { amount: 'desc' } },
          take: 5,
        }),
        this.prisma.movement.aggregate({
          where: {
            companyId,
            fiscalPeriodId,
            type: 'INCOME',
            status: MovementStatus.CONFIRMED,
          },
          _sum: { amount: true },
        }),
        this.prisma.movement.aggregate({
          where: {
            companyId,
            fiscalPeriodId,
            type: 'EXPENSE',
            status: MovementStatus.CONFIRMED,
          },
          _sum: { amount: true },
        }),
      ]);

      const totalIncome = Number(incomeAgg._sum.amount || 0);
      const totalExpense = Number(expenseAgg._sum.amount || 0);

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
        topExpenses: mapCategoryTotals(topExpenseCategories, totalExpense),
        topIncome: mapCategoryTotals(topIncomeCategories, totalIncome),
      };
    } catch (err) {
      this.logger.error(`Categories section failed: ${err instanceof Error ? err.message : err}`);
      return { ...DEFAULT_CATEGORIES };
    }
  }

  private async safeRecentMovements(companyId: string, fiscalPeriodId: string) {
    try {
      return await this.prisma.movement.findMany({
        where: { companyId, fiscalPeriodId, status: MovementStatus.CONFIRMED },
        include: {
          category: { select: { name: true, color: true } },
          counterparty: { select: { name: true } },
        },
        orderBy: { date: 'desc' },
        take: 5,
      });
    } catch (err) {
      this.logger.error(
        `Recent movements section failed: ${err instanceof Error ? err.message : err}`,
      );
      return [...DEFAULT_RECENT_MOVEMENTS];
    }
  }

  private async safeAlerts(companyId: string) {
    try {
      const [counts, items] = await Promise.all([
        this.alertsService.getAlertCounts(companyId),
        this.prisma.alert.findMany({
          where: { companyId, status: 'ACTIVE' },
          orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
          take: 5,
        }),
      ]);
      return { ...counts, items };
    } catch (err) {
      this.logger.error(`Alerts section failed: ${err instanceof Error ? err.message : err}`);
      return { ...DEFAULT_ALERTS };
    }
  }

  private async safeTax(companyId: string, fiscalPeriodId: string) {
    try {
      const summary = await this.taxService.getSummary(companyId, fiscalPeriodId);
      return {
        emitidosTotal: summary.emitidos.total,
        recibidosTotal: summary.recibidos.total,
        balance: summary.balance,
        pendingReconciliation: summary.pendingReconciliation,
      };
    } catch (err) {
      this.logger.error(`Tax section failed: ${err instanceof Error ? err.message : err}`);
      return { ...DEFAULT_TAX };
    }
  }

  private async safeReconciliation(companyId: string, fiscalPeriodId: string) {
    try {
      return await this.reconciliationService.getKpis(companyId, fiscalPeriodId);
    } catch (err) {
      this.logger.error(
        `Reconciliation section failed: ${err instanceof Error ? err.message : err}`,
      );
      return { ...DEFAULT_RECONCILIATION };
    }
  }
}
