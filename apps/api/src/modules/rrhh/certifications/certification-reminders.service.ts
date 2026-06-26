import { Injectable, Logger } from '@nestjs/common';
import { AlertSeverity } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationService } from '../../operations/notifications/notification.service';

/* HR-014 — certification-expiry reminders. EXTENDS the HR-005/HR-007 RRHH reminder
   cron to certifications — NOT a new alert system. Mirrors Document/Contract
   RemindersService exactly: same 30-day window + escalation, the same generic
   inbox (NotificationService.createGeneric → user_notifications), the same RRHH
   manager recipients, and the same same-day dedup keyed on linkPath. VIGENTE
   (persisted; ANULADA excluded) certs with an expiryDate within ALERT_WINDOW_DAYS
   — or already overdue — notify the company's RRHH managers. */
const ALERT_WINDOW_DAYS = 30;
const MANAGER_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER'] as const;

@Injectable()
export class CertificationRemindersService {
  private readonly logger = new Logger(CertificationRemindersService.name);

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
    const rows = await this.prisma.certification.findMany({
      where: { status: 'VIGENTE', expiryDate: { not: null } },
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
          `Certification reminders failed for company ${companyId}: ${
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

    /* Upcoming (≤ horizon) AND already-overdue VIGENTE certs with an expiry.
       status='VIGENTE' excludes ANULADA; expiryDate not null excludes no-expiry. */
    const certs = await this.prisma.certification.findMany({
      where: {
        companyId,
        status: 'VIGENTE',
        expiryDate: { not: null, lte: horizon },
      },
      select: {
        id: true,
        employeeId: true,
        expiryDate: true,
        employee: { select: { fullName: true } },
        certificationType: { select: { name: true } },
      },
    });
    if (certs.length === 0) return { checked: 0, notified: 0 };

    const recipients = await this.resolveManagers(companyId);
    if (recipients.length === 0) return { checked: certs.length, notified: 0 };

    let notified = 0;
    for (const c of certs) {
      const exp = c.expiryDate as Date;
      const daysUntil = Math.floor((exp.getTime() - today.getTime()) / 86400000);
      /* Cert-unique link doubles as the same-day dedup key. */
      const linkPath = `/rrhh/trabajadores/${c.employeeId}?tab=certificaciones&cert=${c.id}`;

      const sameDay = await this.prisma.userNotification.findMany({
        where: { companyId, sourceType: 'GENERAL', linkPath, createdAt: { gte: today } },
        select: { userId: true },
      });
      const already = new Set(sameDay.map((n) => n.userId));
      const toNotify = recipients.filter((u) => !already.has(u));
      if (toNotify.length === 0) continue;

      const dateStr = exp.toISOString().slice(0, 10);
      const overdue = daysUntil < 0;
      const certName = c.certificationType.name;
      const title = overdue
        ? `Certificación vencida — ${c.employee.fullName}`
        : `Certificación por vencer — ${c.employee.fullName}`;
      const message = overdue
        ? `La certificación "${certName}" venció el ${dateStr} (hace ${Math.abs(daysUntil)} días). Requiere renovación.`
        : `La certificación "${certName}" vence el ${dateStr} (en ${daysUntil} días).`;

      const { delivered } = await this.notifications.createGeneric(companyId, {
        userIds: toNotify,
        sourceType: 'GENERAL',
        title,
        message,
        severity: overdue ? 'CRITICAL' : this.severityFor(daysUntil),
        linkPath,
        icon: 'BadgeCheck',
      });
      notified += delivered;
    }
    return { checked: certs.length, notified };
  }

  private async resolveManagers(companyId: string): Promise<string[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { companyId, isActive: true, role: { in: [...MANAGER_ROLES] } },
      select: { userId: true },
    });
    return Array.from(new Set(memberships.map((m) => m.userId)));
  }
}
