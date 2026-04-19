import { Injectable } from '@nestjs/common';
import {
  AlertSeverity,
  AlertStatus,
  AlertType,
  CommitmentStatus,
  MovementStatus,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  async generateAlerts(companyId: string, fiscalPeriodId?: string) {
    const thresholds = await this.getThresholds(companyId);
    const generated: string[] = [];

    // Resolve period
    let periodId = fiscalPeriodId;
    if (!periodId) {
      const now = new Date();
      const period = await this.prisma.fiscalPeriod.findFirst({
        where: { companyId, year: now.getFullYear(), month: now.getMonth() + 1 },
      });
      periodId = period?.id;
    }

    // Rule 1 — COMMITMENT_DUE
    const warningDate = new Date();
    warningDate.setDate(warningDate.getDate() + thresholds.commitmentDaysWarning);
    const criticalDate = new Date();
    criticalDate.setDate(criticalDate.getDate() + thresholds.commitmentDaysCritical);

    const dueCommitments = await this.prisma.commitment.findMany({
      where: {
        companyId,
        status: CommitmentStatus.PENDING,
        dueDate: { lte: warningDate },
      },
    });

    for (const c of dueCommitments) {
      const isCritical = new Date(c.dueDate) <= criticalDate;
      const existing = await this.prisma.alert.findFirst({
        where: {
          companyId,
          type: AlertType.COMMITMENT_DUE,
          status: AlertStatus.ACTIVE,
          metadata: { path: ['commitmentId'], equals: c.id },
        },
      });
      if (!existing) {
        await this.prisma.alert.create({
          data: {
            companyId,
            type: AlertType.COMMITMENT_DUE,
            severity: isCritical ? AlertSeverity.CRITICAL : AlertSeverity.WARNING,
            title: `Compromiso próximo a vencer: ${c.description}`,
            message: `Vence el ${new Date(c.dueDate).toLocaleDateString('es-CL')}. Monto: $${Number(c.amount).toLocaleString('es-CL')}`,
            metadata: { commitmentId: c.id },
          },
        });
        generated.push(`COMMITMENT_DUE: ${c.description}`);
      }
    }

    // Rule 2 — LOW_CASH_BALANCE
    if (periodId) {
      const [incomeAgg, expenseAgg, balances] = await Promise.all([
        this.prisma.movement.aggregate({
          where: {
            companyId,
            fiscalPeriodId: periodId,
            type: 'INCOME',
            status: MovementStatus.CONFIRMED,
          },
          _sum: { amount: true },
        }),
        this.prisma.movement.aggregate({
          where: {
            companyId,
            fiscalPeriodId: periodId,
            type: 'EXPENSE',
            status: MovementStatus.CONFIRMED,
          },
          _sum: { amount: true },
        }),
        this.prisma.accountBalance.findMany({
          where: { companyId, fiscalPeriodId: periodId },
        }),
      ]);

      const opening = balances.reduce((s, b) => s + Number(b.openingBalance), 0);
      const totalCash =
        opening + Number(incomeAgg._sum.amount || 0) - Number(expenseAgg._sum.amount || 0);
      const threshold = Number(thresholds.lowCashThreshold);

      if (totalCash < threshold) {
        const existing = await this.prisma.alert.findFirst({
          where: { companyId, type: AlertType.LOW_CASH_BALANCE, status: AlertStatus.ACTIVE },
        });
        if (!existing) {
          await this.prisma.alert.create({
            data: {
              companyId,
              type: AlertType.LOW_CASH_BALANCE,
              severity: AlertSeverity.CRITICAL,
              title: 'Saldo de caja bajo',
              message: `Caja total: $${totalCash.toLocaleString('es-CL')}. Umbral: $${threshold.toLocaleString('es-CL')}`,
              metadata: { totalCash, threshold },
            },
          });
          generated.push('LOW_CASH_BALANCE');
        }
      }
    }

    // Rule 3 — DRAFT_MOVEMENTS
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const draftCount = await this.prisma.movement.count({
      where: { companyId, status: 'DRAFT', createdAt: { lte: threeDaysAgo } },
    });

    if (draftCount > 0) {
      const existing = await this.prisma.alert.findFirst({
        where: { companyId, type: AlertType.DRAFT_MOVEMENTS, status: AlertStatus.ACTIVE },
      });
      if (!existing) {
        await this.prisma.alert.create({
          data: {
            companyId,
            type: AlertType.DRAFT_MOVEMENTS,
            severity: AlertSeverity.INFO,
            title: `${draftCount} movimientos en borrador`,
            message: `Hay ${draftCount} movimientos sin confirmar con más de 3 días de antigüedad.`,
            metadata: { count: draftCount },
          },
        });
        generated.push('DRAFT_MOVEMENTS');
      }
    }

    return { generated: generated.length, alerts: generated };
  }

  async getActiveAlerts(companyId: string) {
    return this.prisma.alert.findMany({
      where: { companyId, status: AlertStatus.ACTIVE },
      orderBy: [
        { severity: 'desc' }, // CRITICAL=2, WARNING=1, INFO=0 — desc puts CRITICAL first
        { createdAt: 'desc' },
      ],
    });
  }

  async getAlertCounts(companyId: string) {
    const [critical, warning, info] = await Promise.all([
      this.prisma.alert.count({
        where: { companyId, status: AlertStatus.ACTIVE, severity: AlertSeverity.CRITICAL },
      }),
      this.prisma.alert.count({
        where: { companyId, status: AlertStatus.ACTIVE, severity: AlertSeverity.WARNING },
      }),
      this.prisma.alert.count({
        where: { companyId, status: AlertStatus.ACTIVE, severity: AlertSeverity.INFO },
      }),
    ]);
    return { critical, warning, info };
  }

  async dismissAlert(id: string, companyId: string, userId: string) {
    return this.prisma.alert.updateMany({
      where: { id, companyId, status: AlertStatus.ACTIVE },
      data: { status: AlertStatus.DISMISSED, dismissedAt: new Date(), dismissedBy: userId },
    });
  }

  async resolveAlert(id: string, companyId: string) {
    return this.prisma.alert.updateMany({
      where: { id, companyId, status: AlertStatus.ACTIVE },
      data: { status: AlertStatus.RESOLVED, resolvedAt: new Date() },
    });
  }

  async getThresholds(companyId: string) {
    return this.prisma.alertThreshold.upsert({
      where: { companyId },
      update: {},
      create: { companyId },
    });
  }

  async updateThresholds(
    companyId: string,
    dto: {
      lowCashThreshold?: number;
      commitmentDaysWarning?: number;
      commitmentDaysCritical?: number;
    },
  ) {
    return this.prisma.alertThreshold.upsert({
      where: { companyId },
      update: dto,
      create: { companyId, ...dto },
    });
  }
}
