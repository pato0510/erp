import { Injectable } from '@nestjs/common';
import { AssetStatus, DocumentCriticality } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AlertInstancesService } from '../alerts/alert-instances.service';
import { AssetBlockingService } from '../alerts/asset-blocking.service';
import { DocumentRecordsService } from '../document-control/document-records.service';
import { ExceptionsService } from '../exceptions/exceptions.service';
import { ApprovalActionsService } from '../permits/approvals/approval-actions.service';
import { PermitsService } from '../permits/permits.service';
import { WorkPermitsService } from '../permits/work-permits/work-permits.service';
import { AcknowledgmentsService } from '../procedures/acknowledgments/acknowledgments.service';
import { ProceduresService } from '../procedures/procedures.service';

interface AssetRiskScore {
  criticalAlerts: number;
  missingDocs: number;
  expiredDocs: number;
  activeAlerts: number;
  expiring: number;
}

@Injectable()
export class OperationsDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assetBlockingService: AssetBlockingService,
    private readonly alertInstancesService: AlertInstancesService,
    private readonly documentRecordsService: DocumentRecordsService,
    private readonly permitsService: PermitsService,
    private readonly workPermitsService: WorkPermitsService,
    private readonly proceduresService: ProceduresService,
    private readonly acknowledgmentsService: AcknowledgmentsService,
    private readonly exceptionsService: ExceptionsService,
    private readonly approvalActionsService: ApprovalActionsService,
  ) {}

  /* ---- Overview KPIs ------------------------------------------ */

  async getOverview(companyId: string, userId: string) {
    const now = new Date();
    const sevenDaysAhead = new Date(now.getTime() + 7 * 86_400_000);
    const dayAgo = new Date(now.getTime() - 86_400_000);
    const startOfToday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );

    const [
      assetCounts,
      docCompliance,
      permitCompliance,
      alertKpis,
      blockingAlerts,
      escalatedAlerts,
      workPermitCounts,
      authorizedToday,
      procedureKpis,
      myAckCount,
      ackCoverage,
      exceptionPending,
      exceptionsActiveCount,
      exceptionsExpiringSoon,
      approvalCounts,
    ] = await Promise.all([
      this.prisma.operationalAsset.groupBy({
        by: ['status'],
        where: { companyId, isActive: true },
        _count: { _all: true },
      }),
      this.documentRecordsService.getCompliance(companyId),
      this.permitsService.getCompliance(companyId),
      this.alertInstancesService.getKpis(companyId),
      this.prisma.alertInstance.count({
        where: { companyId, status: 'ACTIVE', severity: 'BLOCKING' },
      }),
      this.prisma.alertInstance.count({
        where: { companyId, status: 'ESCALATED' },
      }),
      this.workPermitsService.getActiveCount(companyId),
      this.prisma.workPermit.count({
        where: {
          companyId,
          authorizedAt: { gte: startOfToday },
        },
      }),
      this.proceduresService.getKpiCounts(companyId),
      this.acknowledgmentsService.getMyPendingCount(companyId, userId),
      this.acknowledgmentsService.getCompanyCoverage(companyId),
      this.exceptionsService.getPendingCount(companyId),
      this.prisma.assetException.count({
        where: { companyId, status: 'APPROVED' },
      }),
      this.prisma.assetException.count({
        where: {
          companyId,
          status: 'APPROVED',
          validUntil: { gte: now, lt: sevenDaysAhead },
        },
      }),
      this.approvalActionsService.getApprovalCountsForUser(companyId, userId),
    ]);

    /* Roll up the groupBy result into named buckets so the frontend
       gets stable keys whether or not a status currently has rows. */
    const byStatus: Record<AssetStatus, number> = {
      OPERATIONAL: 0,
      WITH_OBSERVATIONS: 0,
      OUT_OF_SERVICE: 0,
      IN_MAINTENANCE: 0,
      BLOCKED_DOCUMENTAL: 0,
      DECOMMISSIONED: 0,
    } as Record<AssetStatus, number>;
    for (const row of assetCounts) {
      byStatus[row.status] = row._count._all;
    }
    const totalActiveAssets = Object.values(byStatus).reduce((acc, n) => acc + n, 0);
    const operationalAssets = byStatus.OPERATIONAL ?? 0;
    const operationalPercentage =
      totalActiveAssets === 0
        ? 100
        : Math.round((operationalAssets / totalActiveAssets) * 1000) / 10;

    return {
      operationalHealth: {
        totalActiveAssets,
        operationalAssets,
        blockedAssets: byStatus.BLOCKED_DOCUMENTAL ?? 0,
        withObservations: byStatus.WITH_OBSERVATIONS ?? 0,
        inMaintenance: byStatus.IN_MAINTENANCE ?? 0,
        outOfService: byStatus.OUT_OF_SERVICE ?? 0,
        operationalPercentage,
      },
      documentCompliance: {
        totalRequired: docCompliance.totalRequiredDocuments,
        valid: docCompliance.valid,
        expiringSoon: docCompliance.expiringSoon,
        expired: docCompliance.expired,
        missing: docCompliance.missing,
        compliancePercentage: docCompliance.compliancePercentage,
        criticalIssues: docCompliance.bySeverity.critical,
      },
      permitCompliance: {
        activeExternalPermits: permitCompliance.total,
        validExternalPermits: permitCompliance.valid,
        expiringExternalPermits: permitCompliance.expiringSoon,
        expiredExternalPermits: permitCompliance.expired,
        compliancePercentage: permitCompliance.compliancePercentage,
      },
      workPermits: {
        inExecution: workPermitCounts.inExecution,
        pendingAuthorization: workPermitCounts.pending,
        authorizedToday,
        closedToday: workPermitCounts.closedToday,
      },
      procedures: {
        published: procedureKpis.published,
        pendingMyAck: myAckCount.count,
        coveragePercentage: ackCoverage.coveragePercentage,
      },
      alerts: {
        total: alertKpis.total,
        critical: alertKpis.critical,
        blocking: blockingAlerts,
        unattended: alertKpis.unattended,
        escalated: escalatedAlerts,
      },
      exceptions: {
        activeCount: exceptionsActiveCount,
        pendingApproval: exceptionPending.count,
        expiringSoon: exceptionsExpiringSoon,
      },
      approvals: {
        myPending: approvalCounts.mine,
        totalPending: approvalCounts.pendingCompany,
      },
      generatedAt: now.toISOString(),
      _periodMetadata: {
        startOfToday: startOfToday.toISOString(),
        sevenDaysAhead: sevenDaysAhead.toISOString(),
        dayAgo: dayAgo.toISOString(),
      },
    };
  }

  /* ---- Action items (urgent) ---------------------------------- */

  async getActionItems(companyId: string) {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 86_400_000);
    const sevenDaysAhead = new Date(now.getTime() + 7 * 86_400_000);

    const [blockedAssets, criticalUnattendedAlerts, expiredWorkPermits, expiringExceptions] =
      await Promise.all([
        this.assetBlockingService.getBlockedAssets(companyId),
        this.prisma.alertInstance.findMany({
          where: {
            companyId,
            status: 'ACTIVE',
            severity: { in: ['CRITICAL', 'BLOCKING'] },
            triggeredAt: { lt: dayAgo },
          },
          select: {
            id: true,
            title: true,
            severity: true,
            triggeredAt: true,
            asset: { select: { id: true, code: true, name: true } },
          },
          orderBy: { triggeredAt: 'asc' },
          take: 10,
        }),
        this.prisma.workPermit.findMany({
          where: {
            companyId,
            isActive: true,
            status: 'EXPIRED',
            actualEnd: null,
          },
          select: {
            id: true,
            permitNumber: true,
            title: true,
            plannedEnd: true,
          },
          orderBy: { plannedEnd: 'desc' },
          take: 10,
        }),
        this.prisma.assetException.findMany({
          where: {
            companyId,
            status: 'APPROVED',
            validUntil: { gte: now, lt: sevenDaysAhead },
          },
          select: {
            id: true,
            validUntil: true,
            asset: { select: { id: true, code: true, name: true } },
          },
          orderBy: { validUntil: 'asc' },
          take: 10,
        }),
      ]);

    return {
      blockedAssets: blockedAssets.slice(0, 10).map((a) => ({
        assetId: a.id,
        code: a.code,
        name: a.name,
        blockedSince: a.blockedSince,
        blockingDocuments: a.blockingDocumentTypes,
      })),
      criticalUnattendedAlerts,
      expiredWorkPermits,
      expiringExceptions,
    };
  }

  /* ---- Upcoming events ---------------------------------------- */

  async getUpcomingEvents(companyId: string, daysAhead = 30) {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const horizon = new Date(today);
    horizon.setUTCDate(horizon.getUTCDate() + daysAhead);

    const [docRows, permitRows, workPermitRows, ackRows] = await Promise.all([
      this.prisma.documentRecord.findMany({
        where: {
          companyId,
          isActive: true,
          status: 'APPROVED',
          replacedByDocumentId: null,
          expirationDate: { gte: today, lte: horizon },
        },
        select: {
          id: true,
          expirationDate: true,
          documentType: { select: { id: true, name: true, code: true, color: true } },
          asset: { select: { id: true, code: true, name: true } },
        },
        orderBy: { expirationDate: 'asc' },
        take: 50,
      }),
      this.prisma.permit.findMany({
        where: {
          companyId,
          isActive: true,
          status: 'APPROVED',
          replacedByPermitId: null,
          expirationDate: { gte: today, lte: horizon },
        },
        select: {
          id: true,
          permitNumber: true,
          expirationDate: true,
          permitType: { select: { id: true, name: true, code: true } },
          asset: { select: { id: true, code: true, name: true } },
          location: { select: { id: true, code: true, name: true } },
        },
        orderBy: { expirationDate: 'asc' },
        take: 50,
      }),
      this.prisma.workPermit.findMany({
        where: {
          companyId,
          isActive: true,
          status: { in: ['DRAFT', 'PENDING_AUTHORIZATION', 'AUTHORIZED'] },
          plannedStart: { gte: today, lte: horizon },
        },
        select: {
          id: true,
          permitNumber: true,
          title: true,
          plannedStart: true,
          plannedEnd: true,
          status: true,
        },
        orderBy: { plannedStart: 'asc' },
        take: 50,
      }),
      this.prisma.procedureAcknowledgment.findMany({
        where: {
          companyId,
          status: { in: ['PENDING', 'READ'] },
          dueDate: { gte: today, lte: horizon },
        },
        select: {
          id: true,
          dueDate: true,
          procedure: { select: { id: true, code: true, title: true } },
        },
        orderBy: { dueDate: 'asc' },
        take: 50,
      }),
    ]);

    const dayMs = 86_400_000;
    return {
      documentsExpiring: docRows.map((r) => ({
        documentRecordId: r.id,
        type: r.documentType,
        asset: r.asset,
        expirationDate: r.expirationDate,
        daysRemaining: r.expirationDate
          ? Math.max(0, Math.floor((r.expirationDate.getTime() - today.getTime()) / dayMs))
          : null,
      })),
      permitsExpiring: permitRows.map((r) => ({
        permitId: r.id,
        permitNumber: r.permitNumber,
        type: r.permitType,
        target: r.asset ?? r.location ?? null,
        expirationDate: r.expirationDate,
        daysRemaining: r.expirationDate
          ? Math.max(0, Math.floor((r.expirationDate.getTime() - today.getTime()) / dayMs))
          : null,
      })),
      workPermitsScheduled: workPermitRows.map((r) => ({
        id: r.id,
        permitNumber: r.permitNumber,
        title: r.title,
        plannedStart: r.plannedStart,
        plannedEnd: r.plannedEnd,
        status: r.status,
      })),
      pendingAcknowledgments: ackRows
        .filter((r) => r.procedure !== null)
        .map((r) => ({
          procedureId: r.procedure!.id,
          code: r.procedure!.code,
          title: r.procedure!.title,
          dueDate: r.dueDate,
          daysRemaining: r.dueDate
            ? Math.max(0, Math.floor((r.dueDate.getTime() - today.getTime()) / dayMs))
            : null,
        })),
    };
  }

  /* ---- Top assets at risk ------------------------------------- */

  async getTopAssetsAtRisk(companyId: string, limit = 5) {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const thirtyDays = new Date(today);
    thirtyDays.setUTCDate(thirtyDays.getUTCDate() + 30);

    const [activeAssets, alertGroups, requirements, latestApprovedRecords, expiringSoonRecords] =
      await Promise.all([
        this.prisma.operationalAsset.findMany({
          where: { companyId, isActive: true },
          select: {
            id: true,
            code: true,
            name: true,
            status: true,
            assetTypeId: true,
            assetSubtypeId: true,
            assetType: { select: { id: true, name: true, category: true, color: true } },
          },
        }),
        this.prisma.alertInstance.groupBy({
          by: ['assetId', 'severity'],
          where: { companyId, status: 'ACTIVE', assetId: { not: null } },
          _count: { _all: true },
        }),
        this.prisma.documentRequirement.findMany({
          where: { companyId },
          select: {
            documentTypeId: true,
            assetTypeId: true,
            assetSubtypeId: true,
            assetId: true,
            documentType: {
              select: {
                id: true,
                criticality: true,
                alertDaysBefore: true,
              },
            },
          },
        }),
        this.prisma.documentRecord.findMany({
          where: {
            companyId,
            isActive: true,
            status: 'APPROVED',
            replacedByDocumentId: null,
          },
          select: {
            assetId: true,
            documentTypeId: true,
            expirationDate: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.documentRecord.findMany({
          where: {
            companyId,
            isActive: true,
            status: 'APPROVED',
            replacedByDocumentId: null,
            expirationDate: { gte: today, lte: thirtyDays },
          },
          select: { assetId: true },
        }),
      ]);

    /* Tally critical/active alerts per asset. */
    const alertsByAsset = new Map<string, { critical: number; active: number }>();
    for (const row of alertGroups) {
      if (!row.assetId) continue;
      const slot = alertsByAsset.get(row.assetId) ?? { critical: 0, active: 0 };
      slot.active += row._count._all;
      if (row.severity === 'CRITICAL' || row.severity === 'BLOCKING') {
        slot.critical += row._count._all;
      }
      alertsByAsset.set(row.assetId, slot);
    }

    /* Tally documents expiring in next 30 days per asset. */
    const expiringByAsset = new Map<string, number>();
    for (const r of expiringSoonRecords) {
      expiringByAsset.set(r.assetId, (expiringByAsset.get(r.assetId) ?? 0) + 1);
    }

    /* Bucket requirements by candidate (asset/subtype/type) for fast
       lookup per asset — same merge strategy used by getCompliance. */
    const reqByAsset = new Map<
      string,
      Array<{ documentTypeId: string; criticality: DocumentCriticality }>
    >();
    const reqBySubtype = new Map<
      string,
      Array<{ documentTypeId: string; criticality: DocumentCriticality }>
    >();
    const reqByType = new Map<
      string,
      Array<{ documentTypeId: string; criticality: DocumentCriticality }>
    >();
    for (const r of requirements) {
      const entry = {
        documentTypeId: r.documentTypeId,
        criticality: r.documentType.criticality,
      };
      if (r.assetId) {
        const list = reqByAsset.get(r.assetId) ?? [];
        list.push(entry);
        reqByAsset.set(r.assetId, list);
      } else if (r.assetSubtypeId) {
        const list = reqBySubtype.get(r.assetSubtypeId) ?? [];
        list.push(entry);
        reqBySubtype.set(r.assetSubtypeId, list);
      } else if (r.assetTypeId) {
        const list = reqByType.get(r.assetTypeId) ?? [];
        list.push(entry);
        reqByType.set(r.assetTypeId, list);
      }
    }

    /* (assetId, documentTypeId) → latest APPROVED expirationDate. */
    const latestByPair = new Map<string, Date | null>();
    for (const rec of latestApprovedRecords) {
      const key = `${rec.assetId}::${rec.documentTypeId}`;
      if (!latestByPair.has(key)) {
        latestByPair.set(key, rec.expirationDate);
      }
    }

    const scored: Array<{
      asset: {
        id: string;
        code: string;
        name: string;
        status: AssetStatus;
        type: { id: string; name: string; category: string; color: string | null } | null;
      };
      score: number;
      issues: AssetRiskScore;
    }> = [];

    for (const asset of activeAssets) {
      const merged = new Map<string, DocumentCriticality>();
      for (const r of reqByType.get(asset.assetTypeId) ?? []) {
        merged.set(r.documentTypeId, r.criticality);
      }
      if (asset.assetSubtypeId) {
        for (const r of reqBySubtype.get(asset.assetSubtypeId) ?? []) {
          merged.set(r.documentTypeId, r.criticality);
        }
      }
      for (const r of reqByAsset.get(asset.id) ?? []) {
        merged.set(r.documentTypeId, r.criticality);
      }

      let missingCritical = 0;
      let expiredCritical = 0;
      for (const [docTypeId, criticality] of merged.entries()) {
        if (criticality !== 'CRITICAL') continue;
        const exp = latestByPair.get(`${asset.id}::${docTypeId}`);
        if (exp === undefined) {
          missingCritical++;
        } else if (exp && exp < today) {
          expiredCritical++;
        }
      }

      const alertSlot = alertsByAsset.get(asset.id) ?? { critical: 0, active: 0 };
      const expiring = expiringByAsset.get(asset.id) ?? 0;

      const score =
        alertSlot.critical * 10 +
        missingCritical * 5 +
        expiredCritical * 5 +
        alertSlot.active * 3 +
        expiring * 2;

      if (score === 0) continue;

      scored.push({
        asset: {
          id: asset.id,
          code: asset.code,
          name: asset.name,
          status: asset.status,
          type: asset.assetType ?? null,
        },
        score,
        issues: {
          criticalAlerts: alertSlot.critical,
          missingDocs: missingCritical,
          expiredDocs: expiredCritical,
          activeAlerts: alertSlot.active,
          expiring,
        },
      });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, Math.max(1, Math.min(50, limit)));
  }

  /* ---- Recent activity stream --------------------------------- */

  async getRecentActivity(companyId: string, limit = 20) {
    const horizonRows = Math.max(20, limit);
    const [docRows, alertRows, statusChangeRows, workPermitRows, procRows, exceptionRows] =
      await Promise.all([
        this.prisma.documentRecord.findMany({
          where: { companyId, isActive: true, statusChangedAt: { not: null } },
          select: {
            id: true,
            status: true,
            fileName: true,
            statusChangedAt: true,
            statusChangedBy: true,
            asset: { select: { id: true, code: true, name: true } },
            documentType: { select: { id: true, name: true, code: true } },
          },
          orderBy: { statusChangedAt: 'desc' },
          take: horizonRows,
        }),
        this.prisma.alertInstance.findMany({
          where: { companyId },
          select: {
            id: true,
            title: true,
            severity: true,
            status: true,
            triggeredAt: true,
            asset: { select: { id: true, code: true, name: true } },
          },
          orderBy: { triggeredAt: 'desc' },
          take: horizonRows,
        }),
        this.prisma.assetStatusChange.findMany({
          where: { companyId },
          select: {
            id: true,
            previousStatus: true,
            newStatus: true,
            changeType: true,
            reason: true,
            createdAt: true,
            changedBy: true,
            asset: { select: { id: true, code: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: horizonRows,
        }),
        this.prisma.workPermit.findMany({
          where: { companyId, isActive: true, statusChangedAt: { not: null } },
          select: {
            id: true,
            permitNumber: true,
            title: true,
            status: true,
            statusChangedAt: true,
            statusChangedBy: true,
          },
          orderBy: { statusChangedAt: 'desc' },
          take: horizonRows,
        }),
        this.prisma.procedureRevision.findMany({
          where: { companyId },
          select: {
            id: true,
            procedureId: true,
            revisionType: true,
            changedBy: true,
            createdAt: true,
            procedure: { select: { id: true, code: true, title: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: horizonRows,
        }),
        this.prisma.assetException.findMany({
          where: { companyId },
          select: {
            id: true,
            status: true,
            requestedAt: true,
            approvedAt: true,
            rejectedAt: true,
            revokedAt: true,
            requestedBy: true,
            approvedBy: true,
            rejectedBy: true,
            revokedBy: true,
            asset: { select: { id: true, code: true, name: true } },
          },
          orderBy: { requestedAt: 'desc' },
          take: horizonRows,
        }),
      ]);

    type Event = {
      id: string;
      type: string;
      title: string;
      userId: string | null;
      timestamp: Date;
      linkPath: string;
    };

    const events: Event[] = [];

    for (const r of docRows) {
      const verb =
        r.status === 'APPROVED'
          ? 'aprobado'
          : r.status === 'REJECTED'
            ? 'rechazado'
            : r.status === 'PENDING_REVIEW'
              ? 'enviado a revisión'
              : r.status === 'REPLACED'
                ? 'reemplazado'
                : 'actualizado';
      events.push({
        id: `doc-${r.id}`,
        type: 'document',
        title: `Documento ${verb}: ${r.documentType.name}${r.asset ? ` — ${r.asset.code}` : ''}`,
        userId: r.statusChangedBy ?? null,
        timestamp: r.statusChangedAt!,
        linkPath: r.asset
          ? `/operaciones/equipos/${r.asset.id}/carpeta`
          : `/operaciones/documentos`,
      });
    }
    for (const r of alertRows) {
      events.push({
        id: `alert-${r.id}`,
        type: 'alert',
        title: `Alerta ${r.severity.toLowerCase()}: ${r.title}${r.asset ? ` — ${r.asset.code}` : ''}`,
        userId: null,
        timestamp: r.triggeredAt,
        linkPath: '/operaciones/alertas',
      });
    }
    for (const r of statusChangeRows) {
      events.push({
        id: `asc-${r.id}`,
        type: 'asset-status',
        title: `${r.asset?.code ?? 'Activo'}: ${r.previousStatus} → ${r.newStatus}${
          r.changeType === 'AUTO_BLOCK'
            ? ' (auto)'
            : r.changeType === 'AUTO_UNBLOCK'
              ? ' (auto)'
              : ''
        }`,
        userId: r.changedBy,
        timestamp: r.createdAt,
        linkPath: r.asset ? `/operaciones/equipos/${r.asset.id}` : '/operaciones/equipos',
      });
    }
    for (const r of workPermitRows) {
      events.push({
        id: `wp-${r.id}`,
        type: 'work-permit',
        title: `PT ${r.permitNumber} → ${r.status}: ${r.title}`,
        userId: r.statusChangedBy,
        timestamp: r.statusChangedAt!,
        linkPath: `/operaciones/permisos/trabajo/${r.id}`,
      });
    }
    for (const r of procRows) {
      events.push({
        id: `proc-${r.id}`,
        type: 'procedure',
        title: `Procedimiento ${r.revisionType.toLowerCase()}${
          r.procedure ? `: ${r.procedure.code}` : ''
        }`,
        userId: r.changedBy,
        timestamp: r.createdAt,
        linkPath: `/operaciones/procedimientos/${r.procedureId}`,
      });
    }
    for (const r of exceptionRows) {
      const decisionTimestamp =
        r.revokedAt ?? r.rejectedAt ?? r.approvedAt ?? r.requestedAt ?? null;
      const actor = r.revokedBy ?? r.rejectedBy ?? r.approvedBy ?? r.requestedBy ?? null;
      if (!decisionTimestamp) continue;
      events.push({
        id: `exc-${r.id}`,
        type: 'exception',
        title: `Excepción ${r.status.toLowerCase()}${r.asset ? ` — ${r.asset.code}` : ''}`,
        userId: actor,
        timestamp: decisionTimestamp,
        linkPath: `/operaciones/excepciones?id=${r.id}`,
      });
    }

    /* Resolve user names in a single batched lookup so the stream
       can show "Juan P." instead of a UUID. */
    const userIds = Array.from(
      new Set(events.map((e) => e.userId).filter((v): v is string => !!v)),
    );
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true, firstName: true, lastName: true },
        })
      : [];
    const userById = new Map(users.map((u) => [u.id, u]));

    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return events.slice(0, Math.max(1, Math.min(100, limit))).map((e) => ({
      id: e.id,
      type: e.type,
      title: e.title,
      timestamp: e.timestamp,
      linkPath: e.linkPath,
      user: e.userId ? (userById.get(e.userId) ?? null) : null,
    }));
  }

  /* ---- My tasks (personalized) -------------------------------- */

  async getMyTasks(companyId: string, userId: string) {
    const now = new Date();
    const sevenDaysAhead = new Date(now.getTime() + 7 * 86_400_000);

    const [
      myAck,
      myApprovals,
      assignedTotal,
      assignedBlocked,
      assignedWithProblem,
      activeAsSupervisor,
      upcomingAsSupervisor,
    ] = await Promise.all([
      this.acknowledgmentsService.getMyPendingCount(companyId, userId),
      this.approvalActionsService.getApprovalCountsForUser(companyId, userId),
      this.prisma.operationalAsset.count({
        where: { companyId, isActive: true, assignedToUserId: userId },
      }),
      this.prisma.operationalAsset.count({
        where: {
          companyId,
          isActive: true,
          assignedToUserId: userId,
          status: 'BLOCKED_DOCUMENTAL',
        },
      }),
      this.prisma.operationalAsset.count({
        where: {
          companyId,
          isActive: true,
          assignedToUserId: userId,
          status: { in: ['BLOCKED_DOCUMENTAL', 'WITH_OBSERVATIONS', 'OUT_OF_SERVICE'] },
        },
      }),
      this.prisma.workPermit.count({
        where: {
          companyId,
          isActive: true,
          status: 'IN_EXECUTION',
          supervisorId: userId,
        },
      }),
      this.prisma.workPermit.count({
        where: {
          companyId,
          isActive: true,
          status: { in: ['AUTHORIZED', 'PENDING_AUTHORIZATION'] },
          supervisorId: userId,
          plannedStart: { gte: now, lte: sevenDaysAhead },
        },
      }),
    ]);

    return {
      myPendingAcknowledgments: myAck.count,
      myPendingApprovals: myApprovals.mine,
      myAssignedAssets: {
        total: assignedTotal,
        withIssues: assignedWithProblem,
        blocked: assignedBlocked,
      },
      myActiveWorkPermits: activeAsSupervisor,
      myUpcomingPermits: upcomingAsSupervisor,
    };
  }

  /* ---- Asset status distribution (for donut) ------------------ */

  async getAssetStatusDistribution(companyId: string) {
    const groups = await this.prisma.operationalAsset.groupBy({
      by: ['status'],
      where: { companyId, isActive: true },
      _count: { _all: true },
    });
    const allStatuses: AssetStatus[] = [
      'OPERATIONAL',
      'WITH_OBSERVATIONS',
      'IN_MAINTENANCE',
      'BLOCKED_DOCUMENTAL',
      'OUT_OF_SERVICE',
      'DECOMMISSIONED',
    ];
    const counts: Record<string, number> = {};
    for (const s of allStatuses) counts[s] = 0;
    let total = 0;
    for (const row of groups) {
      counts[row.status] = row._count._all;
      total += row._count._all;
    }
    return {
      total,
      segments: allStatuses.map((status) => ({
        status,
        count: counts[status] ?? 0,
        percentage: total === 0 ? 0 : Math.round(((counts[status] ?? 0) / total) * 1000) / 10,
      })),
    };
  }

  /* ---- Compliance by category (5 buckets) --------------------- */

  async getComplianceByCategory(companyId: string) {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const monthStart = new Date(now);
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const [legalAndSafety, permitCompliance, ackCoverage, closeStats] = await Promise.all([
      this.computeDocComplianceForCategories(companyId, today, ['LEGAL', 'SAFETY']),
      this.permitsService.getCompliance(companyId),
      this.acknowledgmentsService.getCompanyCoverage(companyId),
      this.computeWorkPermitCloseStats(companyId, monthStart),
    ]);

    return [
      {
        key: 'documentos-legales',
        label: 'Documentos legales',
        compliancePercentage: legalAndSafety.LEGAL.compliancePercentage,
        total: legalAndSafety.LEGAL.total,
        valid: legalAndSafety.LEGAL.valid,
        expiringSoon: legalAndSafety.LEGAL.expiringSoon,
        expired: legalAndSafety.LEGAL.expired,
        missing: legalAndSafety.LEGAL.missing,
      },
      {
        key: 'documentos-seguridad',
        label: 'Documentos de seguridad',
        compliancePercentage: legalAndSafety.SAFETY.compliancePercentage,
        total: legalAndSafety.SAFETY.total,
        valid: legalAndSafety.SAFETY.valid,
        expiringSoon: legalAndSafety.SAFETY.expiringSoon,
        expired: legalAndSafety.SAFETY.expired,
        missing: legalAndSafety.SAFETY.missing,
      },
      {
        key: 'permisos-externos',
        label: 'Permisos externos',
        compliancePercentage: permitCompliance.compliancePercentage,
        total: permitCompliance.total,
        valid: permitCompliance.valid,
        expiringSoon: permitCompliance.expiringSoon,
        expired: permitCompliance.expired,
        missing: 0,
      },
      {
        key: 'acuses-procedimientos',
        label: 'Acuses de procedimientos',
        compliancePercentage: ackCoverage.coveragePercentage,
        total: ackCoverage.totalAssignments,
        valid: ackCoverage.acknowledged,
        expiringSoon: ackCoverage.read,
        expired: ackCoverage.expired,
        missing: ackCoverage.pending,
      },
      {
        key: 'cierre-permisos-trabajo',
        label: 'Cierre de permisos de trabajo (mes)',
        compliancePercentage: closeStats.compliancePercentage,
        total: closeStats.total,
        valid: closeStats.closed,
        expiringSoon: 0,
        expired: closeStats.expiredWithoutClose,
        missing: 0,
      },
    ];
  }

  /* Per-category document compliance — computes the same VALID/
     EXPIRING_SOON/EXPIRED/MISSING tally as DocumentRecordsService.
     getCompliance, but bucketed by the requirement's documentType
     category. We fold the work into one pass so a 5-category
     dashboard call doesn't run the whole compliance sweep five
     times. */
  private async computeDocComplianceForCategories(
    companyId: string,
    today: Date,
    categories: Array<
      'LEGAL' | 'SAFETY' | 'OPERATIONAL' | 'FINANCIAL' | 'TECHNICAL' | 'ADMINISTRATIVE'
    >,
  ): Promise<
    Record<
      string,
      {
        total: number;
        valid: number;
        expiringSoon: number;
        expired: number;
        missing: number;
        compliancePercentage: number;
      }
    >
  > {
    const [assets, requirements, latestApproved] = await Promise.all([
      this.prisma.operationalAsset.findMany({
        where: { companyId, isActive: true },
        select: { id: true, assetTypeId: true, assetSubtypeId: true },
      }),
      this.prisma.documentRequirement.findMany({
        where: { companyId, documentType: { category: { in: categories } } },
        select: {
          documentTypeId: true,
          assetTypeId: true,
          assetSubtypeId: true,
          assetId: true,
          documentType: {
            select: { category: true, alertDaysBefore: true },
          },
        },
      }),
      this.prisma.documentRecord.findMany({
        where: {
          companyId,
          isActive: true,
          status: 'APPROVED',
          replacedByDocumentId: null,
          documentType: { category: { in: categories } },
        },
        select: {
          assetId: true,
          documentTypeId: true,
          expirationDate: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    type ReqEntry = {
      documentTypeId: string;
      category: string;
      alertDaysBefore: number;
    };
    const byAsset = new Map<string, ReqEntry[]>();
    const bySubtype = new Map<string, ReqEntry[]>();
    const byType = new Map<string, ReqEntry[]>();
    for (const r of requirements) {
      const entry: ReqEntry = {
        documentTypeId: r.documentTypeId,
        category: r.documentType.category,
        alertDaysBefore: r.documentType.alertDaysBefore,
      };
      if (r.assetId) {
        const list = byAsset.get(r.assetId) ?? [];
        list.push(entry);
        byAsset.set(r.assetId, list);
      } else if (r.assetSubtypeId) {
        const list = bySubtype.get(r.assetSubtypeId) ?? [];
        list.push(entry);
        bySubtype.set(r.assetSubtypeId, list);
      } else if (r.assetTypeId) {
        const list = byType.get(r.assetTypeId) ?? [];
        list.push(entry);
        byType.set(r.assetTypeId, list);
      }
    }
    const latestByPair = new Map<string, Date | null>();
    for (const rec of latestApproved) {
      const key = `${rec.assetId}::${rec.documentTypeId}`;
      if (!latestByPair.has(key)) latestByPair.set(key, rec.expirationDate);
    }

    const buckets: Record<
      string,
      {
        total: number;
        valid: number;
        expiringSoon: number;
        expired: number;
        missing: number;
        compliancePercentage: number;
      }
    > = {};
    for (const c of categories) {
      buckets[c] = {
        total: 0,
        valid: 0,
        expiringSoon: 0,
        expired: 0,
        missing: 0,
        compliancePercentage: 100,
      };
    }

    for (const asset of assets) {
      const merged = new Map<string, ReqEntry>();
      for (const r of byType.get(asset.assetTypeId) ?? []) merged.set(r.documentTypeId, r);
      if (asset.assetSubtypeId) {
        for (const r of bySubtype.get(asset.assetSubtypeId) ?? []) {
          merged.set(r.documentTypeId, r);
        }
      }
      for (const r of byAsset.get(asset.id) ?? []) merged.set(r.documentTypeId, r);

      for (const req of merged.values()) {
        const bucket = buckets[req.category];
        if (!bucket) continue;
        bucket.total++;
        const exp = latestByPair.get(`${asset.id}::${req.documentTypeId}`);
        if (exp === undefined) {
          bucket.missing++;
          continue;
        }
        if (!exp) {
          bucket.valid++;
          continue;
        }
        const days = Math.floor((exp.getTime() - today.getTime()) / 86_400_000);
        if (days < 0) bucket.expired++;
        else if (days <= req.alertDaysBefore) bucket.expiringSoon++;
        else bucket.valid++;
      }
    }

    for (const c of categories) {
      const b = buckets[c];
      if (!b) continue;
      b.compliancePercentage =
        b.total === 0 ? 100 : Math.round(((b.valid + b.expiringSoon) / b.total) * 1000) / 10;
    }
    return buckets;
  }

  /* "Did supervisors close their work permits this month, or did they
     let them expire?" Compliance = closed / (closed + expired-without-
     close). 100% when neither exists. */
  private async computeWorkPermitCloseStats(companyId: string, monthStart: Date) {
    const [closed, expiredWithoutClose] = await Promise.all([
      this.prisma.workPermit.count({
        where: { companyId, status: 'CLOSED', closedAt: { gte: monthStart } },
      }),
      this.prisma.workPermit.count({
        where: {
          companyId,
          status: 'EXPIRED',
          actualEnd: null,
          plannedEnd: { gte: monthStart },
        },
      }),
    ]);
    const total = closed + expiredWithoutClose;
    const compliancePercentage = total === 0 ? 100 : Math.round((closed / total) * 1000) / 10;
    return { total, closed, expiredWithoutClose, compliancePercentage };
  }
}

/* Public types — exported so the controller can annotate its return
   shapes if it ever hardens the API surface. Kept at module scope
   rather than as private interfaces because Nest's reflection-based
   serializer doesn't inspect private types. */
export type DashboardOverview = Awaited<ReturnType<OperationsDashboardService['getOverview']>>;
export type DashboardActionItems = Awaited<
  ReturnType<OperationsDashboardService['getActionItems']>
>;
export type DashboardUpcomingEvents = Awaited<
  ReturnType<OperationsDashboardService['getUpcomingEvents']>
>;
export type DashboardTopAssetsAtRisk = Awaited<
  ReturnType<OperationsDashboardService['getTopAssetsAtRisk']>
>;
export type DashboardRecentActivity = Awaited<
  ReturnType<OperationsDashboardService['getRecentActivity']>
>;
export type DashboardMyTasks = Awaited<ReturnType<OperationsDashboardService['getMyTasks']>>;
export type DashboardAssetDistribution = Awaited<
  ReturnType<OperationsDashboardService['getAssetStatusDistribution']>
>;
export type DashboardComplianceByCategory = Awaited<
  ReturnType<OperationsDashboardService['getComplianceByCategory']>
>;
