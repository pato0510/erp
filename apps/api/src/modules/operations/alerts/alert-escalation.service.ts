import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { NotificationService } from '../notifications/notification.service';
import { CompanyAlertSettingsService } from './company-alert-settings.service';

const ENGINE_USER_ID = '00000000-0000-0000-0000-000000000000';

interface EscalationSummary {
  companyId: string;
  considered: number;
  escalated: number;
  notificationsSent: number;
  errors: string[];
}

@Injectable()
export class AlertEscalationService {
  private readonly logger = new Logger(AlertEscalationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
    private readonly settingsService: CompanyAlertSettingsService,
    private readonly notificationService: NotificationService,
  ) {}

  /* OPS-022 — escalation pass for one company. Looks for ACTIVE
     CRITICAL/BLOCKING alerts older than the rule's escalateAfterDays
     (or the company default if no rule fires) and bumps them to
     ESCALATED with a fresh notification fan-out to the escalation
     audience. Already-escalated rows are skipped via status filter. */
  async processEscalations(companyId: string): Promise<EscalationSummary> {
    const settings = await this.settingsService.getOrCreate(companyId, null);
    const summary: EscalationSummary = {
      companyId,
      considered: 0,
      escalated: 0,
      notificationsSent: 0,
      errors: [],
    };

    /* Pull every candidate in one go — only ACTIVE+CRITICAL/BLOCKING
       can escalate. We then walk in memory because the per-row decision
       depends on the matching rule's escalateAfterDays, which the
       indexed query alone can't filter. */
    const candidates = await this.prisma.alertInstance.findMany({
      where: {
        companyId,
        status: 'ACTIVE',
        severity: { in: ['CRITICAL', 'BLOCKING'] },
        escalatedAt: null,
      },
      include: {
        alertRule: {
          select: { id: true, escalateAfterDays: true, escalateToRoles: true },
        },
      },
    });

    const now = Date.now();
    for (const alert of candidates) {
      summary.considered++;
      const window = alert.alertRule?.escalateAfterDays ?? settings.defaultEscalationDays;
      if (!window || window <= 0) continue;
      const ageMs = now - alert.triggeredAt.getTime();
      const dayMs = 24 * 3600_000;
      if (ageMs < window * dayMs) continue;

      try {
        await this.rlsService.executeWithRls(companyId, ENGINE_USER_ID, async (tx) => {
          await tx.alertInstance.update({
            where: { id: alert.id },
            data: {
              status: 'ESCALATED',
              escalatedAt: new Date(),
            },
          });
        });
        summary.escalated++;

        /* Pick the audience: rule's escalateToRoles when configured,
           else fall back to ADMIN as a sensible last-resort target. */
        const escalateRoles =
          alert.alertRule?.escalateToRoles && alert.alertRule.escalateToRoles.length > 0
            ? alert.alertRule.escalateToRoles
            : ['ADMIN'];

        const memberships = await this.prisma.membership.findMany({
          where: {
            companyId,
            isActive: true,
            role: {
              in: escalateRoles.filter(
                (
                  r,
                ): r is 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'ACCOUNTANT' | 'ANALYST' | 'VIEWER' =>
                  ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'ANALYST', 'VIEWER'].includes(
                    r,
                  ),
              ),
            },
          },
          select: { userId: true },
        });
        const targetUserIds = Array.from(new Set(memberships.map((m) => m.userId)));
        if (targetUserIds.length === 0) continue;

        const res = await this.notificationService.createGeneric(
          companyId,
          {
            userIds: targetUserIds,
            sourceType: 'ESCALATION',
            title: `Alerta escalada: ${alert.title}`,
            message: `Esta alerta crítica no fue atendida en ${window} ${
              window === 1 ? 'día' : 'días'
            }.`,
            severity: 'CRITICAL',
            linkPath: `/operaciones/alertas?alertId=${alert.id}`,
            icon: 'TrendingUp',
          },
          { alertInstanceId: alert.id },
        );
        summary.notificationsSent += res.delivered;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          /* Unique constraint on (companyId, assetId, documentTypeId,
             triggerType, days, status) — flipping to ESCALATED could
             collide with an existing ESCALATED row, which is harmless.
             Treat as already-escalated and move on. */
          continue;
        }
        this.logger.error(`Escalation failure on alert ${alert.id}: ${msg}`);
        summary.errors.push(`alert ${alert.id}: ${msg}`);
      }
    }
    this.logger.log(
      `Escalation sweep for company ${companyId}: considered=${summary.considered} escalated=${summary.escalated} notifications=${summary.notificationsSent}`,
    );
    return summary;
  }

  async processAllCompaniesEscalations(): Promise<EscalationSummary[]> {
    const companies = await this.prisma.company.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    const out: EscalationSummary[] = [];
    for (const c of companies) {
      try {
        out.push(await this.processEscalations(c.id));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Escalation sweep failed for company ${c.id}: ${msg}`);
        out.push({
          companyId: c.id,
          considered: 0,
          escalated: 0,
          notificationsSent: 0,
          errors: [msg],
        });
      }
    }
    return out;
  }
}
