import { Injectable, Logger } from '@nestjs/common';
import { AlertSeverity } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationService } from '../../operations/notifications/notification.service';

/* HR-007 — contract-expiry reminders. The HR-005 RRHH reminder cron didn't
   exist yet, so this is its foundation: it REUSES the existing generic inbox
   (NotificationService.createGeneric → user_notifications), not a new alert
   system. PLAZO_FIJO/POR_OBRA VIGENTE contracts whose endDate is within
   ALERT_WINDOW_DAYS (or already overdue) notify the company's RRHH managers,
   idempotently (no duplicate same-day notice per contract, keyed on linkPath). */
const ALERT_WINDOW_DAYS = 30;
const MANAGER_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER'] as const;

@Injectable()
export class ContractRemindersService {
  private readonly logger = new Logger(ContractRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  private utcToday(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  private severityFor(daysUntil: number): AlertSeverity {
    if (daysUntil <= 7) return 'CRITICAL';
    if (daysUntil <= 15) return 'WARNING';
    return 'INFO';
  }

  async runForAllCompanies(): Promise<{ companies: number; checked: number; notified: number }> {
    /* Only companies that actually have fixed-term VIGENTE contracts — keeps the
       sweep cheap and avoids touching tenants with no RRHH data. */
    const rows = await this.prisma.employeeContract.findMany({
      where: {
        status: 'VIGENTE',
        contractType: { in: ['PLAZO_FIJO', 'POR_OBRA'] },
        parentContractId: null, // PRINCIPAL contracts only — anexos don't drive expiry reminders
      },
      select: { companyId: true },
      distinct: ['companyId'],
    });
    let checked = 0;
    let notified = 0;
    for (const { companyId } of rows) {
      try {
        const r = await this.runForCompany(companyId);
        checked += r.checked;
        notified += r.notified;
      } catch (err) {
        this.logger.warn(
          `Contract reminders failed for company ${companyId}: ${
            err instanceof Error ? err.message : err
          }`,
        );
      }
    }
    return { companies: rows.length, checked, notified };
  }

  async runForCompany(companyId: string): Promise<{ checked: number; notified: number }> {
    const today = this.utcToday();
    const horizon = new Date(today);
    horizon.setUTCDate(horizon.getUTCDate() + ALERT_WINDOW_DAYS);

    /* Upcoming (≤ horizon) AND already-overdue (endDate < today, still VIGENTE)
       fixed-term contracts. */
    const contracts = await this.prisma.employeeContract.findMany({
      where: {
        companyId,
        status: 'VIGENTE',
        contractType: { in: ['PLAZO_FIJO', 'POR_OBRA'] },
        parentContractId: null, // PRINCIPAL contracts only — a VIGENTE anexo never drives expiry reminders
        endDate: { not: null, lte: horizon },
      },
      select: {
        id: true,
        employeeId: true,
        endDate: true,
        contractType: true,
        employee: { select: { fullName: true } },
      },
    });
    if (contracts.length === 0) return { checked: 0, notified: 0 };

    const recipients = await this.resolveManagers(companyId);
    if (recipients.length === 0) return { checked: contracts.length, notified: 0 };

    let notified = 0;
    for (const c of contracts) {
      const end = c.endDate as Date;
      const daysUntil = Math.floor((end.getTime() - today.getTime()) / 86400000);
      /* Contract-unique link doubles as the same-day dedup key. */
      const linkPath = `/rrhh/trabajadores/${c.employeeId}?contract=${c.id}`;

      const sameDay = await this.prisma.userNotification.findMany({
        where: { companyId, sourceType: 'GENERAL', linkPath, createdAt: { gte: today } },
        select: { userId: true },
      });
      const already = new Set(sameDay.map((n) => n.userId));
      const toNotify = recipients.filter((u) => !already.has(u));
      if (toNotify.length === 0) continue;

      const dateStr = end.toISOString().slice(0, 10);
      const overdue = daysUntil < 0;
      const title = overdue
        ? `Contrato vencido — ${c.employee.fullName}`
        : `Contrato por vencer — ${c.employee.fullName}`;
      const message = overdue
        ? `El contrato a plazo fijo venció el ${dateStr} (hace ${Math.abs(daysUntil)} días). Revisar situación contractual.`
        : `El contrato a plazo fijo vence el ${dateStr} (en ${daysUntil} días).`;

      const { delivered } = await this.notifications.createGeneric(companyId, {
        userIds: toNotify,
        sourceType: 'GENERAL',
        title,
        message,
        severity: overdue ? 'CRITICAL' : this.severityFor(daysUntil),
        linkPath,
        icon: 'FileClock',
      });
      notified += delivered;
    }
    return { checked: contracts.length, notified };
  }

  /* Active RRHH managers for the company (mirrors NotificationService's private
     resolveRoleUsers — that one isn't exported). */
  private async resolveManagers(companyId: string): Promise<string[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { companyId, isActive: true, role: { in: [...MANAGER_ROLES] } },
      select: { userId: true },
    });
    return Array.from(new Set(memberships.map((m) => m.userId)));
  }
}
