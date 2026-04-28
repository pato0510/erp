import { Injectable, Logger } from '@nestjs/common';
import { AlertSeverity, AlertTriggerType, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { DocumentRequirementsService } from '../document-requirements/document-requirements.service';
import { AlertRulesService } from './alert-rules.service';
import { AssetBlockingService } from './asset-blocking.service';
import { CompanyAlertSettingsService } from './company-alert-settings.service';

interface ProcessOptions {
  /* Skip the "already processed today" gate. Useful for manual triggers
     and tests; the daily cron should leave this false. */
  forcedExecution?: boolean;
  /* Calculate everything but skip the database writes — the engine still
     returns a summary so callers can preview what would happen. */
  dryRun?: boolean;
}

interface ProcessSummary {
  companyId: string;
  assetsProcessed: number;
  alertsCreated: number;
  alertsSkippedExisting: number;
  errors: string[];
  duration: number;
  assetsToBlock: number;
}

const ENGINE_USER_ID = '00000000-0000-0000-0000-000000000000';

@Injectable()
export class AlertEngineService {
  private readonly logger = new Logger(AlertEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
    private readonly requirementsService: DocumentRequirementsService,
    private readonly rulesService: AlertRulesService,
    private readonly settingsService: CompanyAlertSettingsService,
    private readonly blockingService: AssetBlockingService,
  ) {}

  /* OPS-019 — main entry point. Walks every active asset for the
     company, resolves each required document type's compliance state
     today, then emits one AlertInstance per matching rule (or a
     synthesized one for MISSING/EXPIRED triggers without a custom
     rule). The engine relies on the unique constraint
     (companyId, assetId, documentTypeId, triggerType,
     daysBeforeExpiration, status) for idempotency: if an ACTIVE row
     already exists at the same threshold, the insert is skipped. */
  async processCompany(companyId: string, options: ProcessOptions = {}): Promise<ProcessSummary> {
    const start = Date.now();
    const summary: ProcessSummary = {
      companyId,
      assetsProcessed: 0,
      alertsCreated: 0,
      alertsSkippedExisting: 0,
      errors: [],
      duration: 0,
      assetsToBlock: 0,
    };

    /* Day boundary in UTC so DATE columns line up regardless of the
       server's local timezone. */
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const settings = await this.settingsService.getOrCreate(companyId, null);

    /* Load every active asset once. The engine is bound by the number
       of (asset × required-doc-type) pairs, not asset count alone, so
       loading the full list upfront keeps the inner loop free of N+1
       round-trips. */
    const assets = await this.prisma.operationalAsset.findMany({
      where: { companyId, isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        assignedToUserId: true,
        assetTypeId: true,
        assetSubtypeId: true,
      },
    });

    for (const asset of assets) {
      summary.assetsProcessed++;
      try {
        const requirements = await this.requirementsService.resolveRequirementsForAsset(
          companyId,
          asset.id,
        );
        if (requirements.length === 0) continue;

        /* Pull the latest record per (assetId, documentTypeId) for the
           required types in a single query. */
        const requiredTypeIds = requirements.map((r) => r.documentTypeId);
        const records = await this.prisma.documentRecord.findMany({
          where: {
            companyId,
            assetId: asset.id,
            documentTypeId: { in: requiredTypeIds },
            isActive: true,
            replacedByDocumentId: null,
          },
          orderBy: [{ status: 'desc' }, { version: 'desc' }, { createdAt: 'desc' }],
        });
        const latestApprovedByType = new Map<string, (typeof records)[number]>();
        for (const r of records) {
          if (r.status !== 'APPROVED') continue;
          if (!latestApprovedByType.has(r.documentTypeId)) {
            latestApprovedByType.set(r.documentTypeId, r);
          }
        }

        /* For BLOCKING-severity matches we count assets that would be
           blocked under OPS-020. We only count once per asset even if
           multiple blocking docs trigger. */
        let assetWouldBlock = false;

        for (const req of requirements) {
          const documentType = req.documentType;
          const latest = latestApprovedByType.get(documentType.id);

          /* Determine current state. Days are inclusive of the day-of-
             expiration: the day "expires today" yields days = 0. */
          let stateDays: number | null = null;
          const isMissing = !latest;
          let isExpired = false;

          if (latest && latest.expirationDate) {
            const exp = new Date(latest.expirationDate);
            const expUtc = new Date(
              Date.UTC(exp.getUTCFullYear(), exp.getUTCMonth(), exp.getUTCDate()),
            );
            stateDays = Math.floor((expUtc.getTime() - today.getTime()) / 86400000);
            isExpired = stateDays < 0;
          } else if (latest && !latest.expirationDate) {
            /* Approved doc with no expiration — nothing to alert on. */
            continue;
          }

          /* Resolve the rule set for this document type. The resolver
             merges custom AlertRule rows with the dynamic defaults from
             the documentType properties + company settings. */
          const rules = await this.rulesService.resolveRulesForDocumentType(
            companyId,
            documentType.id,
          );

          /* MISSING gets a single synthesized alert per (asset, type).
             We pick the highest severity rule's audience as the
             notification target so the gap is loud. */
          if (isMissing) {
            const best = rules[0];
            const severity: AlertSeverity = best?.severity ?? 'WARNING';
            await this.maybeCreateAlert(companyId, summary, options, {
              alertRuleId: best?.ruleId ?? null,
              documentTypeId: documentType.id,
              assetId: asset.id,
              documentRecordId: null,
              triggerType: 'MISSING',
              severity,
              daysBeforeExpiration: 0,
              expirationDate: null,
              notifiedRoles: best?.targetRoles ?? ['ADMIN', 'MANAGER'],
              notifiedUsers: collectUsers(best, asset.assignedToUserId),
              title: buildTitle({
                trigger: 'MISSING',
                docName: documentType.name,
                assetName: asset.name,
                assetCode: asset.code,
                days: 0,
              }),
              message: `Activo sin documento "${documentType.name}" cargado.`,
              metadata: { criticality: documentType.criticality },
            });
            continue;
          }

          if (stateDays === null) continue;

          /* For each rule whose threshold is reached today, fire an
             alert. The unique key (asset, type, trigger, threshold,
             status=ACTIVE) keeps subsequent runs idempotent. */
          for (const rule of rules) {
            /* A rule fires when today is at or past its window — i.e.
               stateDays <= rule.daysBeforeExpiration. Negative thresholds
               aren't supported (the input DTO enforces >= 0). */
            if (stateDays > rule.daysBeforeExpiration) continue;

            let triggerType: AlertTriggerType;
            if (rule.severity === 'BLOCKING' && stateDays <= 0) {
              triggerType = 'BLOCKING';
              if (settings.enableAutoBlocking) assetWouldBlock = true;
            } else if (isExpired) {
              triggerType = 'EXPIRED';
            } else {
              triggerType = 'EXPIRING_SOON';
            }

            await this.maybeCreateAlert(companyId, summary, options, {
              alertRuleId: rule.ruleId,
              documentTypeId: documentType.id,
              assetId: asset.id,
              documentRecordId: latest!.id,
              triggerType,
              severity: rule.severity,
              daysBeforeExpiration: rule.daysBeforeExpiration,
              expirationDate: latest!.expirationDate,
              notifiedRoles: rule.targetRoles,
              notifiedUsers: collectUsers(rule, asset.assignedToUserId),
              title: buildTitle({
                trigger: triggerType,
                docName: documentType.name,
                assetName: asset.name,
                assetCode: asset.code,
                days: stateDays,
                ruleThreshold: rule.daysBeforeExpiration,
              }),
              message: rule.description ?? null,
              metadata: {
                ruleName: rule.name,
                isDefault: rule.isDefault,
                criticality: documentType.criticality,
                stateDays,
              },
            });
          }
        }

        if (assetWouldBlock) summary.assetsToBlock++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Alert engine failure on asset ${asset.id}: ${msg}`);
        summary.errors.push(`asset ${asset.code}: ${msg}`);
      }
    }

    /* OPS-020 — sweep through asset statuses now that today's alert
       inventory is current. Skipped on dryRun so previews stay
       side-effect free. */
    if (!options.dryRun) {
      try {
        const blockingResult = await this.blockingService.processCompanyBlocking(companyId);
        if (blockingResult.errors.length > 0) {
          summary.errors.push(...blockingResult.errors.map((e) => `blocking: ${e}`));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Blocking sweep failed for company ${companyId}: ${msg}`);
        summary.errors.push(`blocking sweep: ${msg}`);
      }
    }

    summary.duration = Date.now() - start;
    this.logger.log(
      `Alert engine ran for company ${companyId}: ${summary.assetsProcessed} assets, ${summary.alertsCreated} alerts created, ${summary.alertsSkippedExisting} skipped, ${summary.assetsToBlock} would block, ${summary.duration}ms${options.dryRun ? ' (dryRun)' : ''}`,
    );
    return summary;
  }

  /* Iterate all active companies. Kept linear so the cron job stays
     simple — companies are processed sequentially, errors in one don't
     stop the rest. */
  async processAllCompanies(options: ProcessOptions = {}): Promise<ProcessSummary[]> {
    const companies = await this.prisma.company.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    const out: ProcessSummary[] = [];
    for (const c of companies) {
      try {
        out.push(await this.processCompany(c.id, options));
      } catch (err) {
        this.logger.error(
          `Alert engine top-level failure for company ${c.id}: ${err instanceof Error ? err.message : err}`,
        );
        out.push({
          companyId: c.id,
          assetsProcessed: 0,
          alertsCreated: 0,
          alertsSkippedExisting: 0,
          errors: [err instanceof Error ? err.message : String(err)],
          duration: 0,
          assetsToBlock: 0,
        });
      }
    }
    return out;
  }

  private async maybeCreateAlert(
    companyId: string,
    summary: ProcessSummary,
    options: ProcessOptions,
    data: {
      alertRuleId: string | null;
      documentTypeId: string;
      assetId: string;
      documentRecordId: string | null;
      triggerType: AlertTriggerType;
      severity: AlertSeverity;
      daysBeforeExpiration: number;
      expirationDate: Date | null;
      notifiedRoles: string[];
      notifiedUsers: string[];
      title: string;
      message: string | null;
      metadata: Record<string, unknown>;
    },
  ) {
    if (options.dryRun) {
      summary.alertsCreated++;
      return;
    }
    try {
      await this.rlsService.executeWithRls(companyId, ENGINE_USER_ID, async (tx) => {
        await tx.alertInstance.create({
          data: {
            companyId,
            alertRuleId: data.alertRuleId,
            documentTypeId: data.documentTypeId,
            assetId: data.assetId,
            documentRecordId: data.documentRecordId,
            triggerType: data.triggerType,
            severity: data.severity,
            daysBeforeExpiration: data.daysBeforeExpiration,
            expirationDate: data.expirationDate,
            notifiedRoles: data.notifiedRoles,
            notifiedUsers: data.notifiedUsers,
            title: data.title,
            message: data.message,
            metadata: data.metadata as Prisma.InputJsonValue,
          },
        });
      });
      summary.alertsCreated++;
    } catch (err) {
      /* P2002 = unique constraint violation; means an ACTIVE alert
         already exists at this threshold. That's the idempotency
         signal — the engine is allowed to run multiple times a day. */
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        summary.alertsSkippedExisting++;
        return;
      }
      throw err;
    }
  }
}

function collectUsers(
  rule: { notifyAssignedUser?: boolean; notifyOperationalSupervisor?: boolean } | undefined,
  assignedToUserId: string | null,
): string[] {
  /* Operational supervisor isn't a first-class user yet — we leave a
     placeholder so OPS-021 can wire it once the role exists. */
  const out = new Set<string>();
  if (rule?.notifyAssignedUser && assignedToUserId) out.add(assignedToUserId);
  return Array.from(out);
}

function buildTitle(input: {
  trigger: AlertTriggerType;
  docName: string;
  assetName: string;
  assetCode: string;
  days: number;
  ruleThreshold?: number;
}): string {
  const subject = `${input.docName} de ${input.assetName} (${input.assetCode})`;
  switch (input.trigger) {
    case 'MISSING':
      return `${input.docName} falta para ${input.assetName} (${input.assetCode})`;
    case 'EXPIRED':
      return `${subject} vencido hace ${Math.abs(input.days)} ${
        Math.abs(input.days) === 1 ? 'día' : 'días'
      }`;
    case 'BLOCKING':
      return input.days < 0
        ? `${subject} bloquea operación (vencido hace ${Math.abs(input.days)} días)`
        : `${subject} bloquea operación (vence hoy)`;
    case 'EXPIRING_SOON':
    default:
      if (input.days <= 0) {
        return `${subject} vence hoy`;
      }
      return `${subject} vence en ${input.days} ${input.days === 1 ? 'día' : 'días'}`;
  }
}
