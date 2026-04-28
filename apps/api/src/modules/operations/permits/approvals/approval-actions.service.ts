import { createHash, randomUUID } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AlertSeverity,
  ApprovalActionStatus,
  Prisma,
  WorkPermitStatus,
  PermitStatus,
} from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RlsService } from '../../../common/rls/rls.service';
import { NotificationService } from '../../notifications/notification.service';
import {
  ApproveStepDto,
  FilterPendingApprovalsDto,
  RejectStepDto,
  SkipStepDto,
} from './dto/approval-action.dto';

export type PermitTargetKind = 'work-permit' | 'external-permit';

interface ChainContext {
  kind: PermitTargetKind;
  permitId: string;
  permitNumber: string;
  permitTypeId: string;
  requestedBy: string;
  currentApprovalStep: number;
  totalApprovalSteps: number;
}

interface CapturedRequestContext {
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class ApprovalActionsService {
  private readonly logger = new Logger(ApprovalActionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
    private readonly notifications: NotificationService,
  ) {}

  /* Initializes the chain instance for a freshly-submitted permit.
     Creates one PermitApproval row per defined PermitApprovalStep and
     stamps the parent permit's currentApprovalStep + totalApprovalSteps.
     Backwards-compatible: when no steps are configured for the permit
     type, falls back to a synthetic 1-step chain so OPS-024/025
     callers don't break. */
  async initializeApprovalChain(
    companyId: string,
    userId: string,
    permitId: string,
    kind: PermitTargetKind,
  ) {
    const ctx = await this.loadPermitContext(companyId, permitId, kind);
    const stepDefs = await this.prisma.permitApprovalStep.findMany({
      where: {
        companyId,
        ...(kind === 'work-permit'
          ? { workPermitTypeId: ctx.permitTypeId }
          : { permitTypeId: ctx.permitTypeId }),
      },
      orderBy: { stepOrder: 'asc' },
    });

    if (stepDefs.length === 0) {
      /* Fallback — keep OPS-024/025 single-step semantics intact. We
         still create a PermitApproval row so the timeline + audit
         trail remain consistent. */
      const fallback = await this.rlsService.executeWithRls(companyId, userId, (tx) =>
        tx.permitApprovalStep.create({
          data: {
            companyId,
            ...(kind === 'work-permit'
              ? { workPermitTypeId: ctx.permitTypeId }
              : { permitTypeId: ctx.permitTypeId }),
            stepOrder: 1,
            name: kind === 'work-permit' ? 'Autorización supervisor' : 'Aprobación documental',
            requiredRoles: ['MANAGER', 'ADMIN'],
            mustBeDifferentFromRequester: true,
            mustBeDifferentFromPreviousApprovers: true,
            isOptional: false,
            createdBy: userId,
          },
        }),
      );
      stepDefs.push(fallback);
    }

    /* Reset any prior chain state then create PENDING rows. We delete
       prior approvals scoped to this permit so re-submission after a
       rejection starts from a clean slate. */
    await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      await tx.permitApproval.deleteMany({
        where: {
          companyId,
          ...(kind === 'work-permit' ? { workPermitId: permitId } : { permitId }),
        },
      });
      await tx.permitApproval.createMany({
        data: stepDefs.map((s) => ({
          id: randomUUID(),
          companyId,
          ...(kind === 'work-permit' ? { workPermitId: permitId } : { permitId }),
          approvalStepId: s.id,
          stepOrder: s.stepOrder,
          stepName: s.name,
          status: ApprovalActionStatus.PENDING,
        })),
      });
      if (kind === 'work-permit') {
        await tx.workPermit.update({
          where: { id: permitId },
          data: {
            currentApprovalStep: 1,
            totalApprovalSteps: stepDefs.length,
            isFullyApproved: false,
          },
        });
      } else {
        await tx.permit.update({
          where: { id: permitId },
          data: {
            currentApprovalStep: 1,
            totalApprovalSteps: stepDefs.length,
            isFullyApproved: false,
          },
        });
      }
    });

    /* Notify the qualified approvers for step 1. */
    await this.notifyStepApprovers(companyId, ctx, stepDefs[0], 1, stepDefs.length);
    return { totalSteps: stepDefs.length };
  }

  async approveStep(
    companyId: string,
    userId: string,
    permitId: string,
    kind: PermitTargetKind,
    dto: ApproveStepDto,
    request: CapturedRequestContext,
  ) {
    const ctx = await this.loadPermitContext(companyId, permitId, kind);
    if (ctx.currentApprovalStep !== dto.stepOrder) {
      throw new BadRequestException(
        `El paso actual es ${ctx.currentApprovalStep}; recibido ${dto.stepOrder}.`,
      );
    }
    const stepDef = await this.requireStepDef(companyId, permitId, kind, dto.stepOrder);
    await this.assertCanApprove(companyId, userId, ctx, stepDef);

    const now = new Date();
    const notes = dto.notes?.trim() ?? null;
    const signatureHash = this.computeSignatureHash(permitId, userId, now, notes);

    /* Mark the step's PermitApproval row as APPROVED. The row was
       seeded as PENDING by initializeApprovalChain. */
    await this.rlsService.executeWithRls(companyId, userId, (tx) =>
      tx.permitApproval.updateMany({
        where: {
          companyId,
          ...(kind === 'work-permit' ? { workPermitId: permitId } : { permitId }),
          stepOrder: dto.stepOrder,
          status: ApprovalActionStatus.PENDING,
        },
        data: {
          status: ApprovalActionStatus.APPROVED,
          approvedBy: userId,
          approvedAt: now,
          notes,
          signatureHash,
          userIp: request.ip ?? null,
          userAgent: request.userAgent ?? null,
        },
      }),
    );

    const isLast = dto.stepOrder >= ctx.totalApprovalSteps;
    if (isLast) {
      await this.completeChain(companyId, userId, ctx, kind, now);
    } else {
      const nextStep = dto.stepOrder + 1;
      await this.advanceCurrentStep(companyId, userId, kind, permitId, nextStep);
      const nextStepDef = await this.requireStepDef(companyId, permitId, kind, nextStep);
      await this.notifyStepApprovers(companyId, ctx, nextStepDef, nextStep, ctx.totalApprovalSteps);
    }
    return { signatureHash, advancedTo: isLast ? null : dto.stepOrder + 1, completed: isLast };
  }

  async rejectStep(
    companyId: string,
    userId: string,
    permitId: string,
    kind: PermitTargetKind,
    dto: RejectStepDto,
    request: CapturedRequestContext,
  ) {
    const ctx = await this.loadPermitContext(companyId, permitId, kind);
    if (ctx.currentApprovalStep !== dto.stepOrder) {
      throw new BadRequestException(
        `El paso actual es ${ctx.currentApprovalStep}; recibido ${dto.stepOrder}.`,
      );
    }
    const stepDef = await this.requireStepDef(companyId, permitId, kind, dto.stepOrder);
    await this.assertCanApprove(companyId, userId, ctx, stepDef);

    const now = new Date();
    const notes = dto.notes.trim();
    const signatureHash = this.computeSignatureHash(permitId, userId, now, notes);

    await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      await tx.permitApproval.updateMany({
        where: {
          companyId,
          ...(kind === 'work-permit' ? { workPermitId: permitId } : { permitId }),
          stepOrder: dto.stepOrder,
          status: ApprovalActionStatus.PENDING,
        },
        data: {
          status: ApprovalActionStatus.REJECTED,
          rejectedBy: userId,
          rejectedAt: now,
          notes,
          signatureHash,
          userIp: request.ip ?? null,
          userAgent: request.userAgent ?? null,
        },
      });
      if (kind === 'work-permit') {
        await tx.workPermit.update({
          where: { id: permitId },
          data: {
            status: WorkPermitStatus.DRAFT,
            statusReason: `Rechazado en paso ${dto.stepOrder}: ${notes}`,
            statusChangedAt: now,
            statusChangedBy: userId,
            currentApprovalStep: 0,
            isFullyApproved: false,
          },
        });
      } else {
        await tx.permit.update({
          where: { id: permitId },
          data: {
            status: PermitStatus.REJECTED,
            statusReason: `Rechazado en paso ${dto.stepOrder}: ${notes}`,
            statusChangedAt: now,
            statusChangedBy: userId,
            rejectedBy: userId,
            rejectedAt: now,
            currentApprovalStep: 0,
            isFullyApproved: false,
          },
        });
      }
    });

    /* Notify the requester + every previous approver so the rejection
       isn't silent for the people who already moved the permit
       forward. */
    const previousApprovers = await this.prisma.permitApproval.findMany({
      where: {
        companyId,
        ...(kind === 'work-permit' ? { workPermitId: permitId } : { permitId }),
        status: ApprovalActionStatus.APPROVED,
      },
      select: { approvedBy: true },
    });
    const audience = this.uniqueIds([
      ctx.requestedBy,
      ...previousApprovers.map((p) => p.approvedBy ?? null),
    ]);
    await this.notifications.createGeneric(companyId, {
      userIds: audience,
      sourceType: 'WORK_PERMIT_REJECTED',
      title: `Permiso ${ctx.permitNumber} rechazado en paso ${dto.stepOrder}`,
      message: notes,
      severity: 'WARNING' as AlertSeverity,
      linkPath: this.buildLinkPath(kind, permitId),
      icon: 'XCircle',
    });

    return { signatureHash, rejected: true };
  }

  async skipStep(
    companyId: string,
    userId: string,
    permitId: string,
    kind: PermitTargetKind,
    dto: SkipStepDto,
  ) {
    const ctx = await this.loadPermitContext(companyId, permitId, kind);
    if (ctx.currentApprovalStep !== dto.stepOrder) {
      throw new BadRequestException(
        `El paso actual es ${ctx.currentApprovalStep}; recibido ${dto.stepOrder}.`,
      );
    }
    /* ADMIN-only — already enforced by CASL, but we re-check the
       membership here so a misconfigured controller can't bypass. */
    const role = await this.userRoleInCompany(userId, companyId);
    if (!role || !['ADMIN', 'SUPER_ADMIN'].includes(role)) {
      throw new ForbiddenException('Solo un administrador puede omitir un paso.');
    }

    const now = new Date();
    const reason = dto.reason.trim();

    await this.rlsService.executeWithRls(companyId, userId, (tx) =>
      tx.permitApproval.updateMany({
        where: {
          companyId,
          ...(kind === 'work-permit' ? { workPermitId: permitId } : { permitId }),
          stepOrder: dto.stepOrder,
          status: ApprovalActionStatus.PENDING,
        },
        data: {
          status: ApprovalActionStatus.SKIPPED,
          notes: `[OMITIDO por ${userId}] ${reason}`,
          approvedBy: userId,
          approvedAt: now,
          signatureHash: this.computeSignatureHash(permitId, userId, now, reason),
        },
      }),
    );

    const isLast = dto.stepOrder >= ctx.totalApprovalSteps;
    if (isLast) {
      await this.completeChain(companyId, userId, ctx, kind, now);
    } else {
      const nextStep = dto.stepOrder + 1;
      await this.advanceCurrentStep(companyId, userId, kind, permitId, nextStep);
      const nextStepDef = await this.requireStepDef(companyId, permitId, kind, nextStep);
      await this.notifyStepApprovers(companyId, ctx, nextStepDef, nextStep, ctx.totalApprovalSteps);
    }
    return { skipped: dto.stepOrder, completed: isLast };
  }

  /* ---- Read-side ---- */

  /* Returns the queue of items waiting on the current user. The query
     is deliberately broad: we fetch every PENDING approval whose step
     definition includes one of the user's roles (or that names them
     directly) and the permit's currentApprovalStep matches. */
  async getPendingApprovalsForUser(
    companyId: string,
    userId: string,
    filters: FilterPendingApprovalsDto,
  ) {
    const role = await this.userRoleInCompany(userId, companyId);
    /* Step 1 — role-eligible PENDING rows. The Postgres `array &&`
       overlap operator would be nicer, but we stay with the Prisma
       client API for portability. */
    const candidates = await this.prisma.permitApproval.findMany({
      where: {
        companyId,
        status: ApprovalActionStatus.PENDING,
        ...(filters.source === 'work-permit'
          ? { workPermitId: { not: null } }
          : filters.source === 'external-permit'
            ? { permitId: { not: null } }
            : {}),
      },
      include: {
        approvalStep: true,
        workPermit: {
          select: {
            id: true,
            permitNumber: true,
            title: true,
            currentApprovalStep: true,
            totalApprovalSteps: true,
            requestedBy: true,
            createdAt: true,
            permitType: { select: { code: true, name: true, color: true, category: true } },
          },
        },
        permit: {
          select: {
            id: true,
            permitNumber: true,
            currentApprovalStep: true,
            totalApprovalSteps: true,
            uploadedBy: true,
            createdAt: true,
            permitType: { select: { code: true, name: true, color: true, category: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const out: Array<{
      id: string;
      kind: PermitTargetKind;
      permitId: string;
      permitNumber: string;
      title: string;
      stepOrder: number;
      stepName: string;
      currentApprovalStep: number;
      totalApprovalSteps: number;
      requestedBy: string;
      createdAt: Date;
      permitType: { code: string; name: string; color: string | null; category: string };
    }> = [];

    for (const c of candidates) {
      const step = c.approvalStep;
      const eligibleByRole = role !== null && step.requiredRoles.includes(role);
      const eligibleByUser = step.requiresSpecificUserId === userId;
      if (!eligibleByRole && !eligibleByUser) continue;
      if (c.workPermit) {
        if (c.workPermit.currentApprovalStep !== c.stepOrder) continue;
        if (step.mustBeDifferentFromRequester && c.workPermit.requestedBy === userId) continue;
        out.push({
          id: c.id,
          kind: 'work-permit',
          permitId: c.workPermit.id,
          permitNumber: c.workPermit.permitNumber,
          title: c.workPermit.title,
          stepOrder: c.stepOrder,
          stepName: c.stepName,
          currentApprovalStep: c.workPermit.currentApprovalStep,
          totalApprovalSteps: c.workPermit.totalApprovalSteps,
          requestedBy: c.workPermit.requestedBy,
          createdAt: c.createdAt,
          permitType: c.workPermit.permitType,
        });
      } else if (c.permit) {
        if (c.permit.currentApprovalStep !== c.stepOrder) continue;
        if (step.mustBeDifferentFromRequester && c.permit.uploadedBy === userId) continue;
        out.push({
          id: c.id,
          kind: 'external-permit',
          permitId: c.permit.id,
          permitNumber: c.permit.permitNumber,
          title: c.permit.permitNumber,
          stepOrder: c.stepOrder,
          stepName: c.stepName,
          currentApprovalStep: c.permit.currentApprovalStep,
          totalApprovalSteps: c.permit.totalApprovalSteps,
          requestedBy: c.permit.uploadedBy,
          createdAt: c.createdAt,
          permitType: c.permit.permitType,
        });
      }
    }
    return { items: out };
  }

  /* Aggregate counts used by the dashboard KPIs and the sidebar
     badge. We compute "esperando mi aprobación" via the same filter
     as getPendingApprovalsForUser, then count the rest with cheaper
     count() queries. */
  async getApprovalCountsForUser(companyId: string, userId: string) {
    const myQueue = await this.getPendingApprovalsForUser(companyId, userId, { source: 'all' });
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const [pendingCompany, approvedTodayByUser] = await Promise.all([
      this.prisma.permitApproval.count({
        where: { companyId, status: ApprovalActionStatus.PENDING },
      }),
      this.prisma.permitApproval.count({
        where: {
          companyId,
          status: ApprovalActionStatus.APPROVED,
          approvedBy: userId,
          approvedAt: { gte: startOfDay },
        },
      }),
    ]);
    return {
      mine: myQueue.items.length,
      pendingCompany,
      approvedTodayByUser,
    };
  }

  /* Full timeline for one permit. Returns approvals + the original
     step definitions so the UI can render gaps for not-yet-recorded
     steps (e.g., a freshly-rejected permit that was reset to DRAFT). */
  async getTimelineForPermit(companyId: string, permitId: string, kind: PermitTargetKind) {
    const approvals = await this.prisma.permitApproval.findMany({
      where: {
        companyId,
        ...(kind === 'work-permit' ? { workPermitId: permitId } : { permitId }),
      },
      include: {
        approvalStep: true,
      },
      orderBy: { stepOrder: 'asc' },
    });
    return approvals;
  }

  /* ---- Internals ---- */

  private async loadPermitContext(
    companyId: string,
    permitId: string,
    kind: PermitTargetKind,
  ): Promise<ChainContext> {
    if (kind === 'work-permit') {
      const wp = await this.prisma.workPermit.findFirst({
        where: { id: permitId, companyId },
        select: {
          id: true,
          permitNumber: true,
          permitTypeId: true,
          requestedBy: true,
          currentApprovalStep: true,
          totalApprovalSteps: true,
        },
      });
      if (!wp) throw new NotFoundException('Permiso de trabajo no encontrado.');
      return {
        kind,
        permitId: wp.id,
        permitNumber: wp.permitNumber,
        permitTypeId: wp.permitTypeId,
        requestedBy: wp.requestedBy,
        currentApprovalStep: wp.currentApprovalStep,
        totalApprovalSteps: wp.totalApprovalSteps,
      };
    }
    const ep = await this.prisma.permit.findFirst({
      where: { id: permitId, companyId },
      select: {
        id: true,
        permitNumber: true,
        permitTypeId: true,
        uploadedBy: true,
        currentApprovalStep: true,
        totalApprovalSteps: true,
      },
    });
    if (!ep) throw new NotFoundException('Permiso externo no encontrado.');
    return {
      kind,
      permitId: ep.id,
      permitNumber: ep.permitNumber,
      permitTypeId: ep.permitTypeId,
      requestedBy: ep.uploadedBy,
      currentApprovalStep: ep.currentApprovalStep,
      totalApprovalSteps: ep.totalApprovalSteps,
    };
  }

  private async requireStepDef(
    companyId: string,
    permitId: string,
    kind: PermitTargetKind,
    stepOrder: number,
  ) {
    /* Resolve the active PermitApproval row and its step definition,
       so callers can inspect the same template that was snapshotted at
       chain init. */
    const row = await this.prisma.permitApproval.findFirst({
      where: {
        companyId,
        stepOrder,
        ...(kind === 'work-permit' ? { workPermitId: permitId } : { permitId }),
      },
      include: { approvalStep: true },
    });
    if (!row) {
      throw new BadRequestException(
        `El paso ${stepOrder} no existe en la cadena de aprobación de este permiso.`,
      );
    }
    return row.approvalStep;
  }

  private async assertCanApprove(
    companyId: string,
    userId: string,
    ctx: ChainContext,
    stepDef: Prisma.PermitApprovalStepGetPayload<unknown>,
  ) {
    if (stepDef.requiresSpecificUserId && stepDef.requiresSpecificUserId !== userId) {
      throw new ForbiddenException('Este paso solo puede ser aprobado por un usuario específico.');
    }
    if (stepDef.requiredRoles.length > 0 && !stepDef.requiresSpecificUserId) {
      const role = await this.userRoleInCompany(userId, companyId);
      if (!role || (!stepDef.requiredRoles.includes(role) && role !== 'SUPER_ADMIN')) {
        throw new ForbiddenException(
          `Tu rol no autoriza este paso. Se requiere uno de: ${stepDef.requiredRoles.join(', ')}.`,
        );
      }
    }
    if (stepDef.mustBeDifferentFromRequester && ctx.requestedBy === userId) {
      throw new ForbiddenException('El solicitante no puede aprobar su propio permiso.');
    }
    if (stepDef.mustBeDifferentFromPreviousApprovers) {
      const previous = await this.prisma.permitApproval.findFirst({
        where: {
          companyId,
          ...(ctx.kind === 'work-permit'
            ? { workPermitId: ctx.permitId }
            : { permitId: ctx.permitId }),
          stepOrder: { lt: ctx.currentApprovalStep },
          approvedBy: userId,
        },
        select: { id: true },
      });
      if (previous) {
        throw new ForbiddenException(
          'No puedes aprobar dos pasos del mismo permiso (separación de funciones).',
        );
      }
    }
  }

  private computeSignatureHash(
    permitId: string,
    userId: string,
    timestamp: Date,
    notes: string | null,
  ): string {
    return createHash('sha256')
      .update(`${permitId}|${userId}|${timestamp.toISOString()}|${notes ?? ''}`)
      .digest('hex');
  }

  private async advanceCurrentStep(
    companyId: string,
    userId: string,
    kind: PermitTargetKind,
    permitId: string,
    nextStep: number,
  ) {
    await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      if (kind === 'work-permit') {
        await tx.workPermit.update({
          where: { id: permitId },
          data: { currentApprovalStep: nextStep },
        });
      } else {
        await tx.permit.update({
          where: { id: permitId },
          data: { currentApprovalStep: nextStep },
        });
      }
    });
  }

  /* When the chain finishes we transition the parent permit into the
     post-approval state. Work permits move to AUTHORIZED and capture
     authorizedBy/authorizedAt; external permits move to APPROVED with
     approvedBy/approvedAt. */
  private async completeChain(
    companyId: string,
    userId: string,
    ctx: ChainContext,
    kind: PermitTargetKind,
    when: Date,
  ) {
    await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      if (kind === 'work-permit') {
        await tx.workPermit.update({
          where: { id: ctx.permitId },
          data: {
            status: WorkPermitStatus.AUTHORIZED,
            statusReason: null,
            statusChangedAt: when,
            statusChangedBy: userId,
            authorizedBy: userId,
            authorizedAt: when,
            currentApprovalStep: ctx.totalApprovalSteps,
            isFullyApproved: true,
          },
        });
      } else {
        await tx.permit.update({
          where: { id: ctx.permitId },
          data: {
            status: PermitStatus.APPROVED,
            statusReason: null,
            statusChangedAt: when,
            statusChangedBy: userId,
            approvedBy: userId,
            approvedAt: when,
            currentApprovalStep: ctx.totalApprovalSteps,
            isFullyApproved: true,
          },
        });
      }
    });
    await this.notifications.createGeneric(companyId, {
      userIds: this.uniqueIds([ctx.requestedBy]),
      sourceType: kind === 'work-permit' ? 'WORK_PERMIT_AUTHORIZED' : 'DOCUMENT_APPROVED',
      title: `Permiso ${ctx.permitNumber} aprobado`,
      message: 'Tu permiso fue aprobado completamente y queda listo para iniciar.',
      severity: 'INFO' as AlertSeverity,
      linkPath: this.buildLinkPath(kind, ctx.permitId),
      icon: 'CheckCircle2',
    });
  }

  private async notifyStepApprovers(
    companyId: string,
    ctx: ChainContext,
    stepDef: Prisma.PermitApprovalStepGetPayload<unknown>,
    stepOrder: number,
    totalSteps: number,
  ) {
    const userIds = new Set<string>();
    if (stepDef.requiresSpecificUserId) {
      userIds.add(stepDef.requiresSpecificUserId);
    } else if (stepDef.requiredRoles.length > 0) {
      const memberships = await this.prisma.membership.findMany({
        where: {
          companyId,
          isActive: true,
          role: {
            in: stepDef.requiredRoles.filter(
              (r): r is 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'ACCOUNTANT' | 'ANALYST' | 'VIEWER' =>
                ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'ANALYST', 'VIEWER'].includes(r),
            ),
          },
        },
        select: { userId: true },
      });
      memberships.forEach((m) => userIds.add(m.userId));
    }
    /* Don't ping the requester even if they share the role — keeps
       the inbox quiet during the most common manager-self-request
       flow. */
    userIds.delete(ctx.requestedBy);
    if (userIds.size === 0) return;
    await this.notifications.createGeneric(companyId, {
      userIds: [...userIds],
      sourceType: 'WORK_PERMIT_AUTHORIZATION',
      title: `Paso ${stepOrder} de ${totalSteps}: ${ctx.permitNumber} requiere tu aprobación`,
      message: stepDef.name,
      severity: 'WARNING' as AlertSeverity,
      linkPath: this.buildLinkPath(ctx.kind, ctx.permitId),
      icon: 'ShieldAlert',
    });
  }

  private buildLinkPath(kind: PermitTargetKind, permitId: string): string {
    return kind === 'work-permit'
      ? `/operaciones/permisos/trabajo/${permitId}`
      : `/operaciones/permisos`;
  }

  private async userRoleInCompany(userId: string, companyId: string): Promise<string | null> {
    const m = await this.prisma.membership.findFirst({
      where: { userId, companyId, isActive: true },
      select: { role: true },
    });
    return m?.role ?? null;
  }

  private uniqueIds(ids: Array<string | null | undefined>): string[] {
    const set = new Set<string>();
    for (const id of ids) {
      if (id) set.add(id);
    }
    return [...set];
  }
}
