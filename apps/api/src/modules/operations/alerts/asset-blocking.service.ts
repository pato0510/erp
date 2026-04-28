import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AssetStatus, Prisma, StatusChangeType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { DocumentRequirementsService } from '../document-requirements/document-requirements.service';
import { CompanyAlertSettingsService } from './company-alert-settings.service';

/* OPS-020 — single source of truth for "should this asset be blocked
   because of expired/missing CRITICAL+blocksOperation documents?" The
   alert engine, document approval flow, and manual update path all run
   the same evaluator so the answer stays consistent. */

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

/* Statuses that the auto-blocker is allowed to flip into
   BLOCKED_DOCUMENTAL. We deliberately leave OUT_OF_SERVICE,
   DECOMMISSIONED, IN_MAINTENANCE alone — those are explicit operator
   states the engine shouldn't override. */
const AUTO_BLOCKABLE_STATUSES: AssetStatus[] = ['OPERATIONAL', 'WITH_OBSERVATIONS'];

interface BlockingDocumentRef {
  documentTypeId: string;
  documentTypeName: string;
  documentTypeCode: string;
  state: 'MISSING' | 'EXPIRED';
  expirationDate: Date | null;
}

export interface EvaluateBlockingResult {
  shouldBlock: boolean;
  blockingDocuments: BlockingDocumentRef[];
  blockingDocumentTypeIds: string[];
  blockingAlertIds: string[];
  reason: string;
  /* Surfaced so callers (engine + manual flow) know why blocking was
     skipped despite gaps. */
  autoBlockingDisabled: boolean;
}

export interface ProcessBlockingResult {
  /* What changed (or nothing). The frontend uses this to flash a warning
     when a manual unblock immediately re-blocks. */
  action: 'NONE' | 'BLOCKED' | 'UNBLOCKED';
  newStatus: AssetStatus;
  reason: string | null;
  blockingDocuments: BlockingDocumentRef[];
}

@Injectable()
export class AssetBlockingService {
  private readonly logger = new Logger(AssetBlockingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
    private readonly requirementsService: DocumentRequirementsService,
    private readonly settingsService: CompanyAlertSettingsService,
  ) {}

  /* Pure evaluator — never writes. Returns the list of CRITICAL+blocking
     documents that are missing or expired today. The settings flag
     `enableAutoBlocking` flips the `shouldBlock` decision but doesn't
     change the underlying gap list, so a "preview" UI can still show
     what *would* block when the toggle is on. */
  async evaluateAssetBlocking(companyId: string, assetId: string): Promise<EvaluateBlockingResult> {
    const asset = await this.prisma.operationalAsset.findFirst({
      where: { id: assetId, companyId },
      select: { id: true },
    });
    if (!asset) throw new NotFoundException('Activo no encontrado.');

    const [requirements, settings] = await Promise.all([
      this.requirementsService.resolveRequirementsForAsset(companyId, assetId),
      this.settingsService.getOrCreate(companyId, null),
    ]);

    /* Filter to the rules that actually block operation: CRITICAL
       severity AND blocksOperation flag set on the doc type. */
    const blockingTypes = requirements
      .filter(
        (r) => r.documentType.criticality === 'CRITICAL' && r.documentType.blocksOperation === true,
      )
      .map((r) => r.documentType);

    if (blockingTypes.length === 0) {
      return {
        shouldBlock: false,
        blockingDocuments: [],
        blockingDocumentTypeIds: [],
        blockingAlertIds: [],
        reason: 'Activo sin requerimientos bloqueantes.',
        autoBlockingDisabled: !settings.enableAutoBlocking,
      };
    }

    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    /* Pull the latest non-replaced APPROVED record per blocking type in
       a single query — cheaper than a per-type lookup and we only need
       expirationDate to decide. */
    const approved = await this.prisma.documentRecord.findMany({
      where: {
        companyId,
        assetId,
        documentTypeId: { in: blockingTypes.map((t) => t.id) },
        isActive: true,
        replacedByDocumentId: null,
        status: 'APPROVED',
      },
      select: {
        documentTypeId: true,
        expirationDate: true,
      },
      orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
    });
    const approvedByType = new Map<string, Date | null>();
    for (const a of approved) {
      if (!approvedByType.has(a.documentTypeId)) {
        approvedByType.set(a.documentTypeId, a.expirationDate);
      }
    }

    const blockingDocuments: BlockingDocumentRef[] = [];
    for (const dt of blockingTypes) {
      if (!approvedByType.has(dt.id)) {
        blockingDocuments.push({
          documentTypeId: dt.id,
          documentTypeName: dt.name,
          documentTypeCode: dt.code,
          state: 'MISSING',
          expirationDate: null,
        });
        continue;
      }
      const exp = approvedByType.get(dt.id) ?? null;
      if (exp) {
        const expUtc = new Date(
          Date.UTC(exp.getUTCFullYear(), exp.getUTCMonth(), exp.getUTCDate()),
        );
        if (expUtc.getTime() < today.getTime()) {
          blockingDocuments.push({
            documentTypeId: dt.id,
            documentTypeName: dt.name,
            documentTypeCode: dt.code,
            state: 'EXPIRED',
            expirationDate: exp,
          });
        }
      }
      /* Approved doc with no expirationDate is treated as valid. The
         documentType decides whether expiration is even applicable. */
    }

    /* Fetch the ACTIVE alert ids that match the blocking types so the
       audit row can link back to them. We don't fail the evaluation if
       this query errors — it's metadata, not the decision. */
    let blockingAlertIds: string[] = [];
    if (blockingDocuments.length > 0) {
      const alerts = await this.prisma.alertInstance.findMany({
        where: {
          companyId,
          assetId,
          status: 'ACTIVE',
          documentTypeId: { in: blockingDocuments.map((b) => b.documentTypeId) },
        },
        select: { id: true },
      });
      blockingAlertIds = alerts.map((a) => a.id);
    }

    const shouldBlock = blockingDocuments.length > 0 && settings.enableAutoBlocking;
    const reason =
      blockingDocuments.length === 0
        ? 'Sin documentos bloqueantes pendientes.'
        : `Documentos bloqueantes con problema: ${blockingDocuments
            .map((b) => `${b.documentTypeCode} (${b.state === 'MISSING' ? 'falta' : 'vencido'})`)
            .join(', ')}.`;

    return {
      shouldBlock,
      blockingDocuments,
      blockingDocumentTypeIds: blockingDocuments.map((b) => b.documentTypeId),
      blockingAlertIds,
      reason,
      autoBlockingDisabled: !settings.enableAutoBlocking,
    };
  }

  /* "Should this asset come back online?" = no blocking gaps remain.
     Wraps evaluateAssetBlocking so the answer is always consistent. */
  async evaluateAssetUnblocking(
    companyId: string,
    assetId: string,
  ): Promise<{ shouldUnblock: boolean; reason: string }> {
    const asset = await this.prisma.operationalAsset.findFirst({
      where: { id: assetId, companyId },
      select: { status: true },
    });
    if (!asset) throw new NotFoundException('Activo no encontrado.');
    if (asset.status !== 'BLOCKED_DOCUMENTAL') {
      return {
        shouldUnblock: false,
        reason: 'El activo no está en estado BLOQUEADO_DOCUMENTAL.',
      };
    }
    const eval_ = await this.evaluateAssetBlocking(companyId, assetId);
    if (eval_.blockingDocuments.length === 0) {
      return { shouldUnblock: true, reason: 'Documentos bloqueantes resueltos.' };
    }
    return { shouldUnblock: false, reason: eval_.reason };
  }

  /* Apply (or skip) the transition. Idempotent on repeated runs — if
     the asset is already in the right state, returns action=NONE. The
     caller (alert engine, doc approval, manual update path) is
     responsible for ensuring an RLS-aware userId exists for audit
     purposes. */
  async processBlocking(
    companyId: string,
    assetId: string,
    actorUserId: string | null = null,
  ): Promise<ProcessBlockingResult> {
    const asset = await this.prisma.operationalAsset.findFirst({
      where: { id: assetId, companyId },
      select: { status: true },
    });
    if (!asset) throw new NotFoundException('Activo no encontrado.');

    const evaluation = await this.evaluateAssetBlocking(companyId, assetId);
    const userId = actorUserId ?? SYSTEM_USER_ID;

    /* AUTO_BLOCK path: gap exists, settings allow it, and current
       status is one we'll override. */
    if (evaluation.shouldBlock && AUTO_BLOCKABLE_STATUSES.includes(asset.status)) {
      const newStatus: AssetStatus = 'BLOCKED_DOCUMENTAL';
      const reason = evaluation.reason;
      await this.applyTransition(
        companyId,
        userId,
        assetId,
        asset.status,
        newStatus,
        'AUTO_BLOCK',
        reason,
        evaluation.blockingDocumentTypeIds,
        evaluation.blockingAlertIds,
        null,
      );
      return {
        action: 'BLOCKED',
        newStatus,
        reason,
        blockingDocuments: evaluation.blockingDocuments,
      };
    }

    /* AUTO_UNBLOCK path: asset is currently blocked and the gap is
       gone (regardless of the enableAutoBlocking flag, since we always
       want stale BLOCKED_DOCUMENTAL rows to clear once docs are
       fixed). */
    if (asset.status === 'BLOCKED_DOCUMENTAL' && evaluation.blockingDocuments.length === 0) {
      const newStatus: AssetStatus = 'OPERATIONAL';
      const reason = 'Documentos bloqueantes resueltos. Activo recuperado.';
      await this.applyTransition(
        companyId,
        userId,
        assetId,
        asset.status,
        newStatus,
        'AUTO_UNBLOCK',
        reason,
        [],
        [],
        null,
      );
      return {
        action: 'UNBLOCKED',
        newStatus,
        reason,
        blockingDocuments: [],
      };
    }

    return {
      action: 'NONE',
      newStatus: asset.status,
      reason: null,
      blockingDocuments: evaluation.blockingDocuments,
    };
  }

  /* Iterates every active asset in the company. Used by the alert
     engine cron (after recalculation) so freshly expired docs flip
     statuses on the same daily pass. Errors in one asset don't block
     the rest. */
  async processCompanyBlocking(
    companyId: string,
  ): Promise<{ blocked: number; unblocked: number; errors: string[] }> {
    const assets = await this.prisma.operationalAsset.findMany({
      where: { companyId, isActive: true },
      select: { id: true, code: true },
    });
    let blocked = 0;
    let unblocked = 0;
    const errors: string[] = [];
    for (const a of assets) {
      try {
        const r = await this.processBlocking(companyId, a.id, null);
        if (r.action === 'BLOCKED') blocked++;
        else if (r.action === 'UNBLOCKED') unblocked++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Blocking failure on asset ${a.id}: ${msg}`);
        errors.push(`${a.code}: ${msg}`);
      }
    }
    this.logger.log(
      `Blocking sweep for company ${companyId}: blocked=${blocked} unblocked=${unblocked} errors=${errors.length}`,
    );
    return { blocked, unblocked, errors };
  }

  /* Force-unblock entry point — ADMIN-only override that flips the row
     to OPERATIONAL with a MANUAL audit entry. The next cron pass may
     re-block if conditions persist; we don't suppress that. */
  async forceUnblock(companyId: string, assetId: string, userId: string, reason: string) {
    if (!reason || reason.trim().length < 10) {
      throw new ForbiddenException('Indica un motivo (mínimo 10 caracteres) para desbloquear.');
    }
    const asset = await this.prisma.operationalAsset.findFirst({
      where: { id: assetId, companyId },
      select: { status: true },
    });
    if (!asset) throw new NotFoundException('Activo no encontrado.');
    if (asset.status !== 'BLOCKED_DOCUMENTAL') {
      throw new ForbiddenException(
        'Sólo se puede forzar desbloqueo de activos BLOQUEADOS_DOCUMENTAL.',
      );
    }
    await this.applyTransition(
      companyId,
      userId,
      assetId,
      asset.status,
      'OPERATIONAL',
      'MANUAL',
      reason.trim(),
      [],
      [],
      null,
    );
    return { ok: true };
  }

  /* Records a MANUAL status change driven by the assets PATCH path.
     Doesn't actually mutate the asset — that's the caller's job. We're
     only tracking the audit row here, which is why this method is
     public: assets.service can call it after its own update has
     committed. */
  async logManualChange(
    companyId: string,
    userId: string,
    assetId: string,
    previousStatus: AssetStatus,
    newStatus: AssetStatus,
    reason: string | null,
  ) {
    await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      await tx.assetStatusChange.create({
        data: {
          companyId,
          assetId,
          previousStatus,
          newStatus,
          changeType: 'MANUAL',
          reason: reason ?? null,
          changedBy: userId,
        },
      });
    });
  }

  private async applyTransition(
    companyId: string,
    userId: string,
    assetId: string,
    previousStatus: AssetStatus,
    newStatus: AssetStatus,
    changeType: StatusChangeType,
    reason: string,
    triggeringDocumentTypeIds: string[],
    triggeringAlertInstanceIds: string[],
    metadata: Prisma.InputJsonValue | null,
  ) {
    if (previousStatus === newStatus) return;
    await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      await tx.operationalAsset.update({
        where: { id: assetId },
        data: {
          status: newStatus,
          statusReason: reason,
          statusChangedAt: new Date(),
        },
      });
      await tx.assetStatusChange.create({
        data: {
          companyId,
          assetId,
          previousStatus,
          newStatus,
          changeType,
          reason,
          changedBy: changeType === 'MANUAL' ? userId : null,
          triggeringDocumentTypeIds,
          triggeringAlertInstanceIds,
          metadata: metadata ?? Prisma.JsonNull,
        },
      });
    });
  }

  /* Read-only view used by the asset detail "Status history" modal. */
  async getStatusHistory(companyId: string, assetId: string) {
    const asset = await this.prisma.operationalAsset.findFirst({
      where: { id: assetId, companyId },
      select: { id: true },
    });
    if (!asset) throw new NotFoundException('Activo no encontrado.');
    const rows = await this.prisma.assetStatusChange.findMany({
      where: { companyId, assetId },
      orderBy: { createdAt: 'desc' },
    });
    /* Hydrate user info for MANUAL rows in a single batch — same
       pattern as document workflow endpoints. */
    const userIds = Array.from(
      new Set(rows.map((r) => r.changedBy).filter((x): x is string => !!x)),
    );
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true, firstName: true, lastName: true },
        })
      : [];
    const userById = new Map(users.map((u) => [u.id, u]));

    /* Same lookup for triggeringDocumentTypeIds so the UI can label them
       without per-row queries. */
    const docTypeIds = Array.from(new Set(rows.flatMap((r) => r.triggeringDocumentTypeIds)));
    const docTypes = docTypeIds.length
      ? await this.prisma.operationalDocumentType.findMany({
          where: { id: { in: docTypeIds } },
          select: { id: true, name: true, code: true },
        })
      : [];
    const docTypeById = new Map(docTypes.map((d) => [d.id, d]));

    return rows.map((r) => ({
      ...r,
      changedByUser: r.changedBy ? (userById.get(r.changedBy) ?? null) : null,
      triggeringDocumentTypes: r.triggeringDocumentTypeIds
        .map((id) => docTypeById.get(id))
        .filter(Boolean),
    }));
  }

  /* Used by the central `/operaciones/documentos` page to show the
     "Activos bloqueados" section above the list. Returns just the data
     the card needs — code, name, status, blocking gaps if available
     from the most recent AUTO_BLOCK row. */
  async getBlockedAssets(companyId: string) {
    const rows = await this.prisma.operationalAsset.findMany({
      where: { companyId, isActive: true, status: 'BLOCKED_DOCUMENTAL' },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        statusReason: true,
        statusChangedAt: true,
        assetType: { select: { id: true, name: true, category: true } },
      },
      orderBy: { statusChangedAt: 'desc' },
    });

    /* Resolve the most recent AUTO_BLOCK status change for each so the
       card can list which doc types caused the block. */
    if (rows.length === 0) return [];
    const lastBlocks = await this.prisma.assetStatusChange.findMany({
      where: {
        companyId,
        assetId: { in: rows.map((r) => r.id) },
        changeType: { in: ['AUTO_BLOCK', 'MANUAL'] },
        newStatus: 'BLOCKED_DOCUMENTAL',
      },
      orderBy: { createdAt: 'desc' },
    });
    const lastByAsset = new Map<string, (typeof lastBlocks)[number]>();
    for (const lb of lastBlocks) {
      if (!lastByAsset.has(lb.assetId)) lastByAsset.set(lb.assetId, lb);
    }
    const docTypeIds = Array.from(new Set(lastBlocks.flatMap((l) => l.triggeringDocumentTypeIds)));
    const docTypes = docTypeIds.length
      ? await this.prisma.operationalDocumentType.findMany({
          where: { id: { in: docTypeIds } },
          select: { id: true, name: true, code: true },
        })
      : [];
    const docTypeById = new Map(docTypes.map((d) => [d.id, d]));

    return rows.map((r) => {
      const last = lastByAsset.get(r.id);
      return {
        ...r,
        blockedSince: r.statusChangedAt ?? last?.createdAt ?? null,
        blockingDocumentTypes: (last?.triggeringDocumentTypeIds ?? [])
          .map((id) => docTypeById.get(id))
          .filter(Boolean),
        lastChangeType: last?.changeType ?? 'AUTO_BLOCK',
      };
    });
  }
}
