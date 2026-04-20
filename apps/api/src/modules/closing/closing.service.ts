import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { RlsService } from '../common/rls/rls.service';

const WARN_BANK_PCT = 80;
const BLOCK_BANK_PCT = 50;
const WARN_TAX_PCT = 70;

export type ChecklistStatus = 'OK' | 'WARNING' | 'BLOCKED';

export interface ChecklistItem {
  key:
    | 'movements_confirmed'
    | 'bank_reconciliation'
    | 'tax_reconciliation'
    | 'pending_commitments'
    | 'open_alerts';
  label: string;
  status: ChecklistStatus;
  detail: string;
  count: number;
}

export interface Checklist {
  items: ChecklistItem[];
  canClose: boolean;
  blockedReasons: string[];
}

@Injectable()
export class ClosingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  async getChecklist(companyId: string, fiscalPeriodId: string): Promise<Checklist> {
    const period = await this.requirePeriod(companyId, fiscalPeriodId);

    const items = await Promise.all([
      this.checkMovementsConfirmed(companyId, period.id),
      this.checkBankReconciliation(companyId, period.startDate, period.endDate),
      this.checkTaxReconciliation(companyId, period.id),
      this.checkPendingCommitments(companyId, period.id),
      this.checkOpenAlerts(companyId),
    ]);

    const blockedReasons = items
      .filter((i) => i.status === 'BLOCKED')
      .map((i) => `${i.label}: ${i.detail}`);
    const canClose = blockedReasons.length === 0;

    return { items, canClose, blockedReasons };
  }

  async closePeriod(companyId: string, userId: string, fiscalPeriodId: string, notes?: string) {
    const period = await this.requirePeriod(companyId, fiscalPeriodId);
    if (period.status === 'CLOSED') {
      throw new BadRequestException('El período ya está cerrado');
    }
    if (period.status !== 'IN_REVIEW') {
      throw new BadRequestException(
        `Para cerrar el período debe estar en IN_REVIEW (actualmente ${period.status}). ` +
          'Usa PATCH /fiscal-periods/:id/status para pasarlo a IN_REVIEW primero.',
      );
    }

    const checklist = await this.getChecklist(companyId, fiscalPeriodId);
    if (!checklist.canClose) {
      throw new BadRequestException(`No se puede cerrar: ${checklist.blockedReasons.join(' · ')}`);
    }

    const snapshot = await this.getClosingSummary(companyId, fiscalPeriodId);

    const closedPeriod = await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.fiscalPeriod.update({
        where: { id: fiscalPeriodId },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          closedBy: userId,
          notes: notes ?? period.notes,
        },
      });
    });

    return {
      period: closedPeriod,
      snapshot,
      closedAt: closedPeriod.closedAt,
      closedBy: userId,
    };
  }

  async reopenPeriod(companyId: string, userId: string, fiscalPeriodId: string, reason: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_companyId: { userId, companyId } },
      select: { role: true, isActive: true },
    });
    if (!membership || !membership.isActive) {
      throw new ForbiddenException('No hay membresía activa para esta empresa');
    }
    if (membership.role !== 'ADMIN' && membership.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Solo un ADMIN puede reabrir un período cerrado');
    }
    if (!reason || reason.trim().length < 5) {
      throw new BadRequestException('Se requiere una razón (mínimo 5 caracteres) para reabrir');
    }

    const period = await this.requirePeriod(companyId, fiscalPeriodId);
    if (period.status !== 'CLOSED') {
      throw new BadRequestException('Solo se pueden reabrir períodos CLOSED');
    }

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.fiscalPeriod.update({
        where: { id: fiscalPeriodId },
        data: {
          status: 'OPEN',
          closedAt: null,
          closedBy: null,
          notes: `${period.notes ? period.notes + '\n' : ''}Reabierto por ${userId} el ${new Date().toISOString()}: ${reason}`,
        },
      });
    });
  }

  async getClosingSummary(companyId: string, fiscalPeriodId: string) {
    const period = await this.requirePeriod(companyId, fiscalPeriodId);

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, taxId: true, legalName: true },
    });

    const [
      incomeAgg,
      expenseAgg,
      movementsCount,
      balances,
      commitmentsGrouped,
      taxEmitidos,
      taxRecibidos,
      recoSummary,
      topCategoriesGroup,
    ] = await Promise.all([
      this.prisma.movement.aggregate({
        where: {
          companyId,
          fiscalPeriodId,
          type: 'INCOME',
          status: { in: ['CONFIRMED', 'RECONCILED'] },
        },
        _sum: { amount: true },
      }),
      this.prisma.movement.aggregate({
        where: {
          companyId,
          fiscalPeriodId,
          type: 'EXPENSE',
          status: { in: ['CONFIRMED', 'RECONCILED'] },
        },
        _sum: { amount: true },
      }),
      this.prisma.movement.count({ where: { companyId, fiscalPeriodId } }),
      this.prisma.accountBalance.findMany({ where: { companyId, fiscalPeriodId } }),
      this.prisma.commitment.groupBy({
        by: ['status'],
        where: { companyId, fiscalPeriodId },
        _count: true,
      }),
      this.prisma.taxDocument.aggregate({
        where: { companyId, fiscalPeriodId, direction: 'EMITIDO' },
        _sum: { totalAmount: true },
      }),
      this.prisma.taxDocument.aggregate({
        where: { companyId, fiscalPeriodId, direction: 'RECIBIDO' },
        _sum: { totalAmount: true },
      }),
      this.reconciliationSummary(companyId, period.startDate, period.endDate),
      this.prisma.movement.groupBy({
        by: ['categoryId'],
        where: { companyId, fiscalPeriodId, status: { in: ['CONFIRMED', 'RECONCILED'] } },
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'desc' } },
        take: 5,
      }),
    ]);

    const totalIncome = Number(incomeAgg._sum.amount || 0);
    const totalExpense = Number(expenseAgg._sum.amount || 0);
    const opening = balances.reduce((s, b) => s + Number(b.openingBalance), 0);
    const closingBalance = opening + totalIncome - totalExpense;

    const committedAmount = Number(
      (
        await this.prisma.commitment.aggregate({
          where: { companyId, fiscalPeriodId, status: 'PENDING' },
          _sum: { amount: true },
        })
      )._sum.amount || 0,
    );

    const commitmentsByStatus: Record<'paid' | 'pending' | 'cancelled', number> = {
      paid: 0,
      pending: 0,
      cancelled: 0,
    };
    for (const group of commitmentsGrouped) {
      if (group.status === 'PAID') commitmentsByStatus.paid = group._count;
      if (group.status === 'PENDING') commitmentsByStatus.pending = group._count;
      if (group.status === 'CANCELLED') commitmentsByStatus.cancelled = group._count;
    }

    const categoryIds = topCategoriesGroup.map((g) => g.categoryId);
    const categories =
      categoryIds.length > 0
        ? await this.prisma.category.findMany({
            where: { id: { in: categoryIds } },
            select: { id: true, name: true, color: true },
          })
        : [];
    const catMap = new Map(categories.map((c) => [c.id, c]));
    const topCategoriesTotal = topCategoriesGroup.reduce(
      (s, g) => s + Number(g._sum.amount || 0),
      0,
    );
    const topCategories = topCategoriesGroup.map((g) => ({
      name: catMap.get(g.categoryId)?.name ?? 'Sin nombre',
      color: catMap.get(g.categoryId)?.color ?? '#888',
      total: Number(g._sum.amount || 0),
      percentage:
        topCategoriesTotal > 0
          ? Math.round((Number(g._sum.amount || 0) / topCategoriesTotal) * 100)
          : 0,
    }));

    const emitidosTotal = Number(taxEmitidos._sum.totalAmount || 0);
    const recibidosTotal = Number(taxRecibidos._sum.totalAmount || 0);

    let closedByUser: { firstName: string; lastName: string; email: string } | null = null;
    if (period.closedBy) {
      closedByUser = await this.prisma.user.findUnique({
        where: { id: period.closedBy },
        select: { firstName: true, lastName: true, email: true },
      });
    }

    return {
      period: {
        id: period.id,
        name: period.name,
        year: period.year,
        month: period.month,
        startDate: period.startDate,
        endDate: period.endDate,
        status: period.status,
        notes: period.notes,
      },
      company,
      movements: {
        totalIncome,
        totalExpense,
        balance: totalIncome - totalExpense,
        count: movementsCount,
      },
      cash: {
        opening,
        closing: closingBalance,
        free: closingBalance - committedAmount,
        committed: committedAmount,
      },
      reconciliation: recoSummary,
      tax: {
        emitidosTotal,
        recibidosTotal,
        balance: emitidosTotal - recibidosTotal,
      },
      topCategories,
      commitments: commitmentsByStatus,
      closedBy: closedByUser ? `${closedByUser.firstName} ${closedByUser.lastName}` : null,
      closedAt: period.closedAt,
    };
  }

  // ──────────────────────── checklist rules ────────────────────────

  private async checkMovementsConfirmed(
    companyId: string,
    fiscalPeriodId: string,
  ): Promise<ChecklistItem> {
    const count = await this.prisma.movement.count({
      where: { companyId, fiscalPeriodId, status: 'DRAFT' },
    });
    if (count === 0) {
      return {
        key: 'movements_confirmed',
        label: 'Todos los movimientos confirmados',
        status: 'OK',
        detail: 'No hay movimientos en estado DRAFT',
        count: 0,
      };
    }
    return {
      key: 'movements_confirmed',
      label: 'Todos los movimientos confirmados',
      status: 'BLOCKED',
      detail: `${count} movimiento${count > 1 ? 's' : ''} aún en DRAFT — confírmalos o cancélalos antes de cerrar`,
      count,
    };
  }

  private async checkBankReconciliation(
    companyId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ChecklistItem> {
    const [total, reconciled] = await Promise.all([
      this.prisma.externalBankMovement.count({
        where: { companyId, date: { gte: startDate, lte: endDate } },
      }),
      this.prisma.externalBankMovement.count({
        where: {
          companyId,
          date: { gte: startDate, lte: endDate },
          isReconciled: true,
        },
      }),
    ]);

    if (total === 0) {
      return {
        key: 'bank_reconciliation',
        label: 'Conciliación bancaria completada',
        status: 'OK',
        detail: 'No hay movimientos bancarios en este período',
        count: 0,
      };
    }

    const pct = Math.round((reconciled / total) * 100);
    const pending = total - reconciled;
    if (pct >= WARN_BANK_PCT) {
      return {
        key: 'bank_reconciliation',
        label: 'Conciliación bancaria completada',
        status: 'OK',
        detail: `${pct}% conciliado (${reconciled}/${total})`,
        count: pending,
      };
    }
    if (pct >= BLOCK_BANK_PCT) {
      return {
        key: 'bank_reconciliation',
        label: 'Conciliación bancaria completada',
        status: 'WARNING',
        detail: `${pct}% conciliado — se recomienda >= ${WARN_BANK_PCT}% antes de cerrar`,
        count: pending,
      };
    }
    return {
      key: 'bank_reconciliation',
      label: 'Conciliación bancaria completada',
      status: 'BLOCKED',
      detail: `Solo ${pct}% conciliado (mínimo requerido: ${BLOCK_BANK_PCT}%)`,
      count: pending,
    };
  }

  private async checkTaxReconciliation(
    companyId: string,
    fiscalPeriodId: string,
  ): Promise<ChecklistItem> {
    const [total, reconciled] = await Promise.all([
      this.prisma.taxDocument.count({ where: { companyId, fiscalPeriodId } }),
      this.prisma.taxDocument.count({
        where: { companyId, fiscalPeriodId, isReconciled: true },
      }),
    ]);

    if (total === 0) {
      return {
        key: 'tax_reconciliation',
        label: 'Documentos SII conciliados',
        status: 'OK',
        detail: 'No hay documentos tributarios en este período',
        count: 0,
      };
    }

    const pct = Math.round((reconciled / total) * 100);
    const pending = total - reconciled;
    if (pct >= WARN_TAX_PCT) {
      return {
        key: 'tax_reconciliation',
        label: 'Documentos SII conciliados',
        status: 'OK',
        detail: `${pct}% conciliado (${reconciled}/${total})`,
        count: pending,
      };
    }
    return {
      key: 'tax_reconciliation',
      label: 'Documentos SII conciliados',
      status: 'WARNING',
      detail: `${pct}% conciliado — se recomienda >= ${WARN_TAX_PCT}%`,
      count: pending,
    };
  }

  private async checkPendingCommitments(
    companyId: string,
    fiscalPeriodId: string,
  ): Promise<ChecklistItem> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const overdue = await this.prisma.commitment.count({
      where: {
        companyId,
        fiscalPeriodId,
        status: 'PENDING',
        dueDate: { lt: today },
      },
    });

    if (overdue === 0) {
      return {
        key: 'pending_commitments',
        label: 'Compromisos vencidos pendientes',
        status: 'OK',
        detail: 'No hay compromisos vencidos sin pagar',
        count: 0,
      };
    }
    return {
      key: 'pending_commitments',
      label: 'Compromisos vencidos pendientes',
      status: 'WARNING',
      detail: `${overdue} compromiso${overdue > 1 ? 's' : ''} vencido${overdue > 1 ? 's' : ''} sin pagar`,
      count: overdue,
    };
  }

  private async checkOpenAlerts(companyId: string): Promise<ChecklistItem> {
    const critical = await this.prisma.alert.count({
      where: { companyId, status: 'ACTIVE', severity: 'CRITICAL' },
    });

    if (critical === 0) {
      return {
        key: 'open_alerts',
        label: 'Alertas críticas resueltas',
        status: 'OK',
        detail: 'No hay alertas críticas activas',
        count: 0,
      };
    }
    return {
      key: 'open_alerts',
      label: 'Alertas críticas resueltas',
      status: 'WARNING',
      detail: `${critical} alerta${critical > 1 ? 's' : ''} crítica${critical > 1 ? 's' : ''} activa${critical > 1 ? 's' : ''}`,
      count: critical,
    };
  }

  // ──────────────────────── helpers ────────────────────────

  private async requirePeriod(companyId: string, fiscalPeriodId: string) {
    const period = await this.prisma.fiscalPeriod.findFirst({
      where: { id: fiscalPeriodId, companyId },
    });
    if (!period) throw new NotFoundException('Período fiscal no encontrado');
    return period;
  }

  private async reconciliationSummary(companyId: string, startDate: Date, endDate: Date) {
    const [total, reconciled] = await Promise.all([
      this.prisma.externalBankMovement.count({
        where: { companyId, date: { gte: startDate, lte: endDate } },
      }),
      this.prisma.externalBankMovement.count({
        where: {
          companyId,
          date: { gte: startDate, lte: endDate },
          isReconciled: true,
        },
      }),
    ]);
    const pending = total - reconciled;
    const pct = total > 0 ? Math.round((reconciled / total) * 100) : 0;
    return {
      reconciledPercentage: pct,
      pendingCount: pending,
      totalBankMovements: total,
      reconciledBankMovements: reconciled,
    };
  }
}
