import { Injectable, Logger } from '@nestjs/common';
import { AlertSeverity } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationService } from '../../operations/notifications/notification.service';

/* HR-005 — document-expiry reminders. EXTENDS the HR-007 RRHH reminder cron to
   employee documents — it does NOT build a new alert system. Mirrors
   ContractRemindersService exactly: same windows/escalation, the same generic
   inbox (NotificationService.createGeneric → user_notifications), the same RRHH
   manager recipients, and the same same-day dedup keyed on linkPath. APPROVED,
   non-superseded (supersededById IS NULL) documents with an expiryDate within
   ALERT_WINDOW_DAYS — or already overdue — notify the company's RRHH managers.
   The status='APPROVED' filter inherently excludes REPLACED/ARCHIVED, and the
   `expiryDate: not null` filter excludes documents with no expiry. */
const ALERT_WINDOW_DAYS = 30;
const MANAGER_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER'] as const;

@Injectable()
export class DocumentRemindersService {
  private readonly logger = new Logger(DocumentRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  private utcToday(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  /* Same escalation convention as ContractRemindersService (30/15/7 windows). */
  private severityFor(daysUntil: number): AlertSeverity {
    if (daysUntil <= 7) return 'CRITICAL';
    if (daysUntil <= 15) return 'WARNING';
    return 'INFO';
  }

  async runForAllCompanies(): Promise<{ companies: number; checked: number; notified: number }> {
    /* Only companies that actually have APPROVED, non-superseded, expiry-bearing
       documents — keeps the sweep cheap and avoids touching tenants with none. */
    const rows = await this.prisma.employeeDocument.findMany({
      where: {
        status: 'APPROVED',
        supersededById: null,
        expiryDate: { not: null },
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
          `Document reminders failed for company ${companyId}: ${
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

    /* Upcoming (≤ horizon) AND already-overdue (expiryDate < today) documents that
       are APPROVED + non-superseded. status='APPROVED' excludes REPLACED/ARCHIVED;
       expiryDate: not null excludes no-expiry docs. */
    const documents = await this.prisma.employeeDocument.findMany({
      where: {
        companyId,
        status: 'APPROVED',
        supersededById: null,
        expiryDate: { not: null, lte: horizon },
      },
      select: {
        id: true,
        employeeId: true,
        expiryDate: true,
        employee: { select: { fullName: true } },
        documentType: { select: { name: true } },
      },
    });
    if (documents.length === 0) return { checked: 0, notified: 0 };

    const recipients = await this.resolveManagers(companyId);
    if (recipients.length === 0) return { checked: documents.length, notified: 0 };

    let notified = 0;
    for (const d of documents) {
      const exp = d.expiryDate as Date;
      const daysUntil = Math.floor((exp.getTime() - today.getTime()) / 86400000);
      /* Document-unique link doubles as the same-day dedup key (so two documents
         of the same employee don't collide). Points at the employee's documents
         tab on the ficha. */
      const linkPath = `/rrhh/trabajadores/${d.employeeId}?tab=documentos&doc=${d.id}`;

      const sameDay = await this.prisma.userNotification.findMany({
        where: { companyId, sourceType: 'GENERAL', linkPath, createdAt: { gte: today } },
        select: { userId: true },
      });
      const already = new Set(sameDay.map((n) => n.userId));
      const toNotify = recipients.filter((u) => !already.has(u));
      if (toNotify.length === 0) continue;

      const dateStr = exp.toISOString().slice(0, 10);
      const overdue = daysUntil < 0;
      const docType = d.documentType.name;
      const title = overdue
        ? `Documento vencido — ${d.employee.fullName}`
        : `Documento por vencer — ${d.employee.fullName}`;
      const message = overdue
        ? `El documento "${docType}" venció el ${dateStr} (hace ${Math.abs(daysUntil)} días). Requiere renovación.`
        : `El documento "${docType}" vence el ${dateStr} (en ${daysUntil} días).`;

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
    return { checked: documents.length, notified };
  }

  /* Active RRHH managers for the company — identical to ContractRemindersService. */
  private async resolveManagers(companyId: string): Promise<string[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { companyId, isActive: true, role: { in: [...MANAGER_ROLES] } },
      select: { userId: true },
    });
    return Array.from(new Set(memberships.map((m) => m.userId)));
  }
}
