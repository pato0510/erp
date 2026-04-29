import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { RlsService } from '../common/rls/rls.service';
import { CompanyAlertSettingsService } from '../operations/alerts/company-alert-settings.service';
import { CommitmentTemplatesService } from '../operations/commitment-templates/commitment-templates.service';
import type { CommitmentEstimate } from '../operations/commitment-templates/commitment-templates.service';
import type {
  AssetBlockedEvent,
  AssetUnblockedEvent,
  DocumentRenewalImminentEvent,
  OperationalCostEvent,
  PermitRenewalImminentEvent,
  ProcedureAcknowledgmentExpiredEvent,
  WorkPermitClosedEvent,
} from '../operations/events/domain-event-types';

/* OPS-033 — Finance side of the Operations bus. The two
   renewal-imminent handlers now create real Commitment rows in
   the cashflow projection: look up the cost template, find the
   matching FiscalPeriod, dedupe against any existing pending row,
   then write through executeWithRls so the audit trail captures
   the system-driven origin.

   Every handler is intentionally tolerant — a thrown error here
   is caught by DomainEventsService.markFailed so the audit row
   turns FAILED and the retry cron picks it up. */

@Injectable()
export class OperationsListenersService {
  private readonly logger = new Logger(OperationsListenersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rls: RlsService,
    private readonly templates: CommitmentTemplatesService,
    private readonly alertSettings: CompanyAlertSettingsService,
  ) {}

  @OnEvent('document.renewal-imminent')
  async handleDocumentRenewal(event: DocumentRenewalImminentEvent) {
    return this.handleRenewal({
      kind: 'document_renewal',
      companyId: event.companyId,
      sourceId: event.documentRecordId,
      titleSubject: `${event.documentTypeName} - ${event.assetCode}`,
      contextSentence: `Renovación de ${event.documentTypeName} para ${event.assetName} antes del ${event.expirationDate.slice(0, 10)}.`,
      dueDate: new Date(event.expirationDate),
      metadata: {
        documentTypeId: event.documentTypeId,
        documentTypeCode: event.documentTypeCode,
        documentTypeName: event.documentTypeName,
        assetId: event.assetId,
        assetCode: event.assetCode,
        assetName: event.assetName,
        daysRemaining: event.daysRemaining,
        isCritical: event.isCritical,
        blocksOperation: event.blocksOperation,
      },
      estimate: () => this.templates.estimateForDocument(event.companyId, event.documentTypeId),
    });
  }

  @OnEvent('permit.renewal-imminent')
  async handlePermitRenewal(event: PermitRenewalImminentEvent) {
    return this.handleRenewal({
      kind: 'permit_renewal',
      companyId: event.companyId,
      sourceId: event.permitId,
      titleSubject: `${event.permitTypeName} - ${event.permitNumber}`,
      contextSentence: `Renovación de ${event.permitTypeName} (${event.permitNumber}) antes del ${event.expirationDate.slice(0, 10)}.`,
      dueDate: new Date(event.expirationDate),
      metadata: {
        permitId: event.permitId,
        permitNumber: event.permitNumber,
        permitTypeCode: event.permitTypeCode,
        permitTypeName: event.permitTypeName,
        daysRemaining: event.daysRemaining,
      },
      /* The renewal-imminent payload carries permitTypeCode but the
         estimator wants permitTypeId. We resolve via PermitType
         table since it's a per-company unique on `code`. */
      estimate: async () => {
        const permitType = await this.prisma.permitType.findFirst({
          where: { companyId: event.companyId, code: event.permitTypeCode },
          select: { id: true },
        });
        if (!permitType) return null;
        return this.templates.estimateForPermit(event.companyId, permitType.id);
      },
    });
  }

  @OnEvent('asset.blocked')
  async handleAssetBlocked(event: AssetBlockedEvent) {
    /* No financial side-effect today — keeping the audit trail
       light. A future ticket may flag the asset as
       revenue-at-risk on a producing-asset registry. */
    this.logger.log(
      `[finance] asset.blocked logged — ${event.assetCode} (was ${event.previousStatus})`,
    );
    return { handler: 'asset-blocked', noop: true };
  }

  @OnEvent('asset.unblocked')
  async handleAssetUnblocked(event: AssetUnblockedEvent) {
    this.logger.log(
      `[finance] asset.unblocked logged — ${event.assetCode} ${event.previousStatus} → ${event.newStatus}`,
    );
    return { handler: 'asset-unblocked', noop: true };
  }

  @OnEvent('work-permit.closed')
  async handleWorkPermitClosed(event: WorkPermitClosedEvent) {
    /* Future: when WorkPermits captures cost on close (PO #, gas
       supplier, etc), translate it into an OperationalCostEvent
       and persist a real expense commitment. */
    this.logger.log(
      `[finance] work-permit.closed logged — ${event.permitNumber} actual=${event.actualDuration}h`,
    );
    return { handler: 'work-permit-closed', noop: true };
  }

  @OnEvent('procedure.acknowledgment-expired')
  async handleAckExpired(event: ProcedureAcknowledgmentExpiredEvent) {
    this.logger.log(
      `[finance] procedure.acknowledgment-expired logged — ${event.procedureCode} for ${event.userEmail}`,
    );
    return { handler: 'ack-expired', noop: true };
  }

  @OnEvent('operational.cost')
  async handleOperationalCost(_event: OperationalCostEvent) {
    /* OPS-033 V1 — log only. The auto-commitment pipeline today
       is renewal-driven; ad-hoc cost capture lands in OPS-033 V2. */
    return { handler: 'operational-cost', noop: true };
  }

  /* ---- Internals ---------------------------------------------- */

  private async handleRenewal(args: {
    kind: 'document_renewal' | 'permit_renewal';
    companyId: string;
    sourceId: string;
    titleSubject: string;
    contextSentence: string;
    dueDate: Date;
    metadata: Record<string, unknown>;
    estimate: () => Promise<CommitmentEstimate | null>;
  }) {
    const settings = await this.alertSettings.getOrCreate(args.companyId, null);
    if (!settings.enableAutoCommitments) {
      return { handler: args.kind, skipped: 'auto-commitments disabled' };
    }

    /* Idempotency — only one un-fulfilled auto-commitment per
       (sourceType, sourceId). The spec deliberately keys off the
       source row id (e.g. the documentRecordId), which means the
       NEXT version of a doc/permit gets its own commitment row.
       A re-emit of the same event during the same renewal cycle
       re-attaches to the same commitment. */
    const existing = await this.prisma.commitment.findFirst({
      where: {
        companyId: args.companyId,
        sourceType: args.kind,
        sourceId: args.sourceId,
        autoFulfilledAt: null,
      },
      select: { id: true, status: true },
    });
    if (existing) {
      return {
        handler: args.kind,
        skipped: 'commitment exists',
        commitmentId: existing.id,
      };
    }

    const estimate = await args.estimate();
    if (!estimate) {
      return { handler: args.kind, skipped: 'no estimate available' };
    }

    /* Find the fiscal period containing the dueDate. The Cashflow
       module already fails commitment creation without one, so we
       skip gracefully if the operator hasn't created the matching
       period yet. */
    const period = await this.prisma.fiscalPeriod.findFirst({
      where: {
        companyId: args.companyId,
        year: args.dueDate.getUTCFullYear(),
        month: args.dueDate.getUTCMonth() + 1,
      },
      select: { id: true },
    });
    if (!period) {
      this.logger.warn(
        `[finance] ${args.kind} skipped — no fiscal period for ${args.dueDate.toISOString().slice(0, 10)} (company ${args.companyId})`,
      );
      return { handler: args.kind, skipped: 'no fiscal period' };
    }

    /* RLS write — the system user id stays null because there's no
       human action behind this row. The audit trigger captures
       INSERT against a NULL changedBy which the cashflow UI maps
       to "Sistema". */
    try {
      const commitment = await this.rls.executeWithRls(args.companyId, null, async (tx) =>
        tx.commitment.create({
          data: {
            companyId: args.companyId,
            fiscalPeriodId: period.id,
            type: 'EXPENSE',
            amount: new Prisma.Decimal(estimate.amount),
            currency: estimate.currency,
            dueDate: args.dueDate,
            description: `Renovación: ${args.titleSubject} — ${args.contextSentence}`,
            categoryId: estimate.categoryId,
            status: 'PENDING',
            sourceType: args.kind,
            sourceId: args.sourceId,
            sourceMetadata: {
              ...args.metadata,
              estimateSource: estimate.source,
              estimateAmount: estimate.amount,
            } as Prisma.InputJsonValue,
            isAutoGenerated: true,
          },
          select: { id: true },
        }),
      );
      this.logger.log(
        `[finance] ${args.kind} commitment ${commitment.id} created for ${args.titleSubject}`,
      );
      return {
        handler: args.kind,
        commitmentId: commitment.id,
        amount: estimate.amount,
        estimateSource: estimate.source,
      };
    } catch (err) {
      this.logger.error(
        `[finance] ${args.kind} commitment creation failed: ${err instanceof Error ? err.message : err}`,
      );
      throw err;
    }
  }
}
