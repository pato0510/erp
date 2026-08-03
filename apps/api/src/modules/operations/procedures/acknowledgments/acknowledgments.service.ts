import { createHash } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AcknowledgmentStatus, AlertSeverity, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RlsService } from '../../../common/rls/rls.service';
import { DomainEventsService } from '../../events/domain-events.service';
import { NotificationService } from '../../notifications/notification.service';
import { AcknowledgeDto, ExemptUserDto, FilterAcknowledgmentsDto } from './dto/workflow.dto';

interface RequestContext {
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AcknowledgmentsService {
  private readonly logger = new Logger(AcknowledgmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
    private readonly notifications: NotificationService,
    private readonly domainEvents: DomainEventsService,
  ) {}

  /* ---- Lifecycle: create / track / acknowledge ---------------- */

  /* Called from ProceduresService.publish when requiresAcknowledgment
     is true. Builds the target user list from applicableRoles +
     applicableAssetIds (via assignedToUserId) + applicableAssetTypeIds
     (via assets of those types). Skips users who already have an
     ACKNOWLEDGED row for this procedure. */
  async createPendingForProcedure(companyId: string, procedureId: string, actorUserId: string) {
    const proc = await this.prisma.procedure.findFirst({
      where: { id: procedureId, companyId },
      select: {
        id: true,
        title: true,
        code: true,
        publishedAt: true,
        applicableRoles: true,
        applicableAssetIds: true,
        applicableAssetTypeIds: true,
        applicableLocationIds: true,
        acknowledgmentDeadlineDays: true,
        requiresAcknowledgment: true,
      },
    });
    if (!proc) throw new NotFoundException('Procedimiento no encontrado.');
    if (!proc.requiresAcknowledgment) return { created: 0 };

    const targets = await this.resolveTargetUsers(companyId, {
      applicableRoles: proc.applicableRoles,
      applicableAssetIds: proc.applicableAssetIds,
      applicableAssetTypeIds: proc.applicableAssetTypeIds,
      applicableLocationIds: proc.applicableLocationIds,
    });
    if (targets.size === 0) return { created: 0 };

    const dueDate = proc.acknowledgmentDeadlineDays
      ? new Date(
          (proc.publishedAt?.getTime() ?? Date.now()) +
            proc.acknowledgmentDeadlineDays * 86_400_000,
        )
      : null;

    /* Pre-fetch existing rows so we can skip ACKNOWLEDGED users
       (they already complied) and "reset" PENDING/READ rows by
       updating their dueDate. EXPIRED + EXEMPTED also get
       refreshed so the new publication starts a clean cycle. */
    const existing = await this.prisma.procedureAcknowledgment.findMany({
      where: { companyId, procedureId, userId: { in: [...targets] } },
      select: { id: true, userId: true, status: true },
    });
    const existingByUser = new Map(existing.map((e) => [e.userId, e]));

    let created = 0;
    let refreshed = 0;
    await this.rlsService.executeWithRls(companyId, actorUserId, async (tx) => {
      for (const userId of targets) {
        const prior = existingByUser.get(userId);
        if (prior?.status === 'ACKNOWLEDGED') continue;
        if (prior) {
          await tx.procedureAcknowledgment.update({
            where: { id: prior.id },
            data: {
              status: AcknowledgmentStatus.PENDING,
              dueDate,
              reminderCount: 0,
              lastReminderSentAt: null,
              exemptedBy: null,
              exemptedAt: null,
              exemptionReason: null,
            },
          });
          refreshed += 1;
        } else {
          await tx.procedureAcknowledgment.create({
            data: {
              companyId,
              procedureId,
              userId,
              status: AcknowledgmentStatus.PENDING,
              dueDate,
            },
          });
          created += 1;
        }
      }
    });

    /* Fan-out notifications. Severity defaults to WARNING; the
       reminder cron later escalates to CRITICAL closer to the
       deadline. */
    if (targets.size > 0) {
      await this.notifications.createGeneric(companyId, {
        userIds: [...targets],
        sourceType: 'GENERAL',
        title: `Nuevo procedimiento requiere tu lectura: ${proc.code}`,
        message: proc.title,
        severity: 'WARNING' as AlertSeverity,
        linkPath: `/operaciones/procedimientos/${procedureId}`,
        icon: 'BookOpen',
      });
    }

    return { created, refreshed, totalTargets: targets.size };
  }

  /* Mirrors createPendingForProcedure but only re-targets the users
     who acknowledged the previous version. Used when publishing a
     new version of a procedure to force re-acknowledgment. */
  async createPendingForNewVersion(
    companyId: string,
    actorUserId: string,
    newProcedureId: string,
    previousProcedureId: string,
  ) {
    const previousAcks = await this.prisma.procedureAcknowledgment.findMany({
      where: {
        companyId,
        procedureId: previousProcedureId,
        status: 'ACKNOWLEDGED',
      },
      select: { userId: true },
    });
    if (previousAcks.length === 0) return { created: 0 };
    const userIds = [...new Set(previousAcks.map((a) => a.userId))];

    const proc = await this.prisma.procedure.findFirst({
      where: { id: newProcedureId, companyId },
      select: {
        id: true,
        code: true,
        title: true,
        publishedAt: true,
        acknowledgmentDeadlineDays: true,
      },
    });
    if (!proc) return { created: 0 };
    const dueDate = proc.acknowledgmentDeadlineDays
      ? new Date(
          (proc.publishedAt?.getTime() ?? Date.now()) +
            proc.acknowledgmentDeadlineDays * 86_400_000,
        )
      : null;

    let created = 0;
    await this.rlsService.executeWithRls(companyId, actorUserId, async (tx) => {
      for (const userId of userIds) {
        try {
          await tx.procedureAcknowledgment.create({
            data: {
              companyId,
              procedureId: newProcedureId,
              userId,
              status: AcknowledgmentStatus.PENDING,
              dueDate,
            },
          });
          created += 1;
        } catch (err) {
          /* P2002 — already exists (e.g., re-publish). Skip silently
             and let the row stand. */
          if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') {
            throw err;
          }
        }
      }
    });

    if (userIds.length > 0) {
      await this.notifications.createGeneric(companyId, {
        userIds,
        sourceType: 'GENERAL',
        title: `Nueva versión publicada: ${proc.code}`,
        message: `Hay una nueva versión del procedimiento "${proc.title}" que requiere tu lectura.`,
        severity: 'WARNING' as AlertSeverity,
        linkPath: `/operaciones/procedimientos/${newProcedureId}`,
        icon: 'BookOpen',
      });
    }
    return { created };
  }

  /* Called when a user opens or downloads the procedure file. We
     keep this idempotent — repeated calls just bump viewCount and
     never demote a higher-progressed status. */
  async trackView(companyId: string, userId: string, procedureId: string) {
    const proc = await this.prisma.procedure.findFirst({
      where: { id: procedureId, companyId },
      select: { id: true, requiresAcknowledgment: true },
    });
    if (!proc || !proc.requiresAcknowledgment) return;
    await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const existing = await tx.procedureAcknowledgment.findFirst({
        where: { companyId, procedureId, userId },
        select: { id: true, status: true, firstViewedAt: true },
      });
      if (!existing) {
        /* User opened a procedure they weren't pre-targeted for —
           e.g., clicked through from a search. We still record a
           READ row so the audit captures it. */
        await tx.procedureAcknowledgment.create({
          data: {
            companyId,
            procedureId,
            userId,
            status: AcknowledgmentStatus.READ,
            firstViewedAt: new Date(),
            viewCount: 1,
          },
        });
        return;
      }
      const next: AcknowledgmentStatus = existing.status === 'PENDING' ? 'READ' : existing.status;
      await tx.procedureAcknowledgment.update({
        where: { id: existing.id },
        data: {
          status: next,
          firstViewedAt: existing.firstViewedAt ?? new Date(),
          viewCount: { increment: 1 },
        },
      });
    });
  }

  async acknowledge(
    companyId: string,
    userId: string,
    procedureId: string,
    dto: AcknowledgeDto,
    request: RequestContext,
  ) {
    const existing = await this.prisma.procedureAcknowledgment.findFirst({
      where: { companyId, procedureId, userId },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw new NotFoundException('No tienes una lectura pendiente para este procedimiento.');
    }
    if (existing.status === 'ACKNOWLEDGED') {
      throw new BadRequestException('Ya acusaste este procedimiento.');
    }
    if (existing.status === 'EXEMPTED') {
      throw new BadRequestException('Tu lectura está exenta — solicita reactivación.');
    }
    if (existing.status === 'EXPIRED') {
      /* Allow late acks but record them — the audit trail (the
         signature timestamp) lets ops see the user fixed an
         overdue. */
    }

    const now = new Date();
    const notes = dto.notes?.trim() ?? null;
    const signatureHash = this.signatureHash(procedureId, userId, now, notes);

    await this.rlsService.executeWithRls(companyId, userId, (tx) =>
      tx.procedureAcknowledgment.update({
        where: { id: existing.id },
        data: {
          status: AcknowledgmentStatus.ACKNOWLEDGED,
          acknowledgedAt: now,
          signatureHash,
          acknowledgedFromIp: request.ip ?? null,
          acknowledgedUserAgent: request.userAgent ?? null,
          acknowledgmentNotes: notes,
        },
      }),
    );

    /* Self-confirmation. The user just clicked the button so a
       toast on the frontend already covers this — but the
       persisted notification gives them the same record in their
       inbox for compliance audits. */
    const proc = await this.prisma.procedure.findFirst({
      where: { id: procedureId, companyId },
      select: { code: true, title: true },
    });
    if (proc) {
      await this.notifications.createGeneric(companyId, {
        userIds: [userId],
        sourceType: 'DOCUMENT_APPROVED',
        title: `Acuse registrado: ${proc.code}`,
        message: proc.title,
        severity: 'INFO' as AlertSeverity,
        linkPath: `/operaciones/procedimientos/${procedureId}`,
        icon: 'CheckCircle2',
      });
    }
    return { signatureHash };
  }

  async exempt(
    companyId: string,
    actorUserId: string,
    procedureId: string,
    targetUserId: string,
    dto: ExemptUserDto,
  ) {
    const role = await this.userRoleInCompany(actorUserId, companyId);
    if (!role || !['ADMIN', 'SUPER_ADMIN'].includes(role)) {
      throw new ForbiddenException('Solo un administrador puede exentar usuarios.');
    }
    const reason = dto.reason.trim();
    const existing = await this.prisma.procedureAcknowledgment.findFirst({
      where: { companyId, procedureId, userId: targetUserId },
      select: { id: true },
    });

    const now = new Date();
    if (existing) {
      await this.rlsService.executeWithRls(companyId, actorUserId, (tx) =>
        tx.procedureAcknowledgment.update({
          where: { id: existing.id },
          data: {
            status: AcknowledgmentStatus.EXEMPTED,
            exemptedBy: actorUserId,
            exemptedAt: now,
            exemptionReason: reason,
          },
        }),
      );
    } else {
      await this.rlsService.executeWithRls(companyId, actorUserId, (tx) =>
        tx.procedureAcknowledgment.create({
          data: {
            companyId,
            procedureId,
            userId: targetUserId,
            status: AcknowledgmentStatus.EXEMPTED,
            exemptedBy: actorUserId,
            exemptedAt: now,
            exemptionReason: reason,
          },
        }),
      );
    }

    const proc = await this.prisma.procedure.findFirst({
      where: { id: procedureId, companyId },
      select: { code: true, title: true },
    });
    await this.notifications.createGeneric(companyId, {
      userIds: [targetUserId],
      sourceType: 'GENERAL',
      title: proc ? `Exento de acusar ${proc.code}` : 'Exento de acuse de procedimiento',
      message: reason,
      severity: 'INFO' as AlertSeverity,
      linkPath: `/operaciones/procedimientos/${procedureId}`,
      icon: 'ShieldCheck',
    });
    return { exempted: true };
  }

  async reapply(companyId: string, actorUserId: string, procedureId: string, targetUserId: string) {
    const role = await this.userRoleInCompany(actorUserId, companyId);
    if (!role || !['ADMIN', 'SUPER_ADMIN'].includes(role)) {
      throw new ForbiddenException('Solo un administrador puede reaplicar acuses.');
    }
    const existing = await this.prisma.procedureAcknowledgment.findFirst({
      where: { companyId, procedureId, userId: targetUserId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('No existe acuse para este usuario / procedimiento.');
    }
    const proc = await this.prisma.procedure.findFirst({
      where: { id: procedureId, companyId },
      select: {
        publishedAt: true,
        acknowledgmentDeadlineDays: true,
        code: true,
        title: true,
      },
    });
    const dueDate = proc?.acknowledgmentDeadlineDays
      ? new Date(
          (proc.publishedAt?.getTime() ?? Date.now()) +
            proc.acknowledgmentDeadlineDays * 86_400_000,
        )
      : null;
    await this.rlsService.executeWithRls(companyId, actorUserId, (tx) =>
      tx.procedureAcknowledgment.update({
        where: { id: existing.id },
        data: {
          status: AcknowledgmentStatus.PENDING,
          dueDate,
          reminderCount: 0,
          lastReminderSentAt: null,
          exemptedBy: null,
          exemptedAt: null,
          exemptionReason: null,
        },
      }),
    );
    if (proc) {
      await this.notifications.createGeneric(companyId, {
        userIds: [targetUserId],
        sourceType: 'GENERAL',
        title: `Acuse reactivado: ${proc.code}`,
        message: proc.title,
        severity: 'WARNING' as AlertSeverity,
        linkPath: `/operaciones/procedimientos/${procedureId}`,
        icon: 'BookOpen',
      });
    }
    return { reapplied: true };
  }

  /* ---- Cron jobs ---------------------------------------------- */

  async processExpiredForAllCompanies() {
    const now = new Date();
    const candidates = await this.prisma.procedureAcknowledgment.findMany({
      where: {
        status: { in: ['PENDING', 'READ'] },
        dueDate: { lt: now },
      },
      select: {
        id: true,
        companyId: true,
        procedureId: true,
        userId: true,
      },
    });
    if (candidates.length === 0) return { expired: 0 };
    let expired = 0;
    for (const c of candidates) {
      try {
        await this.rlsService.executeWithRls(c.companyId, null, (tx) =>
          tx.procedureAcknowledgment.update({
            where: { id: c.id },
            data: { status: AcknowledgmentStatus.EXPIRED },
          }),
        );
        const proc = await this.prisma.procedure.findFirst({
          where: { id: c.procedureId, companyId: c.companyId },
          select: { code: true, title: true },
        });
        if (proc) {
          await this.notifications.createGeneric(c.companyId, {
            userIds: [c.userId],
            sourceType: 'ESCALATION',
            title: `Acuse vencido: ${proc.code}`,
            message: `Tu acuse del procedimiento "${proc.title}" venció.`,
            severity: 'CRITICAL' as AlertSeverity,
            linkPath: `/operaciones/procedimientos/${c.procedureId}`,
            icon: 'AlertCircle',
          });
        }
        /* OPS-032 — domain event so Finance/HSEC consumers see the
           same expiration the user just got notified about. */
        try {
          const user = await this.prisma.user.findUnique({
            where: { id: c.userId },
            select: { email: true },
          });
          await this.domainEvents.emit({
            type: 'procedure.acknowledgment-expired',
            companyId: c.companyId,
            // OPS-038 — the row's own UUID PK is the aggregate identity.
            acknowledgmentId: c.id,
            procedureId: c.procedureId,
            procedureCode: proc?.code ?? '?',
            procedureTitle: proc?.title ?? '?',
            userId: c.userId,
            userEmail: user?.email ?? '',
            occurredAt: now.toISOString(),
          });
        } catch (emitErr) {
          this.logger.warn(
            `domain-event procedure.acknowledgment-expired emit failed: ${emitErr instanceof Error ? emitErr.message : emitErr}`,
          );
        }
        expired += 1;
      } catch (err) {
        this.logger.warn(
          `Failed to expire ack ${c.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    return { expired };
  }

  async sendRemindersForAllCompanies() {
    const now = new Date();
    const horizon = new Date(now.getTime() + 3 * 86_400_000);
    const dayAgo = new Date(now.getTime() - 86_400_000);
    const candidates = await this.prisma.procedureAcknowledgment.findMany({
      where: {
        status: { in: ['PENDING', 'READ'] },
        dueDate: { not: null, lte: horizon },
        reminderCount: { lt: 3 },
        OR: [{ lastReminderSentAt: null }, { lastReminderSentAt: { lt: dayAgo } }],
      },
      select: {
        id: true,
        companyId: true,
        procedureId: true,
        userId: true,
        dueDate: true,
        reminderCount: true,
      },
    });
    if (candidates.length === 0) return { sent: 0 };
    let sent = 0;
    for (const c of candidates) {
      const daysToDeadline = c.dueDate
        ? Math.round((c.dueDate.getTime() - now.getTime()) / 86_400_000)
        : 0;
      const severity: AlertSeverity =
        daysToDeadline <= 0 ? 'CRITICAL' : daysToDeadline <= 1 ? 'CRITICAL' : 'WARNING';
      const proc = await this.prisma.procedure.findFirst({
        where: { id: c.procedureId, companyId: c.companyId },
        select: { code: true, title: true },
      });
      try {
        await this.rlsService.executeWithRls(c.companyId, null, (tx) =>
          tx.procedureAcknowledgment.update({
            where: { id: c.id },
            data: {
              reminderCount: { increment: 1 },
              lastReminderSentAt: now,
            },
          }),
        );
        if (proc) {
          await this.notifications.createGeneric(c.companyId, {
            userIds: [c.userId],
            sourceType: 'ESCALATION',
            title:
              daysToDeadline <= 0
                ? `Lectura vencida: ${proc.code}`
                : `Recordatorio: lectura ${proc.code} vence en ${daysToDeadline} día(s)`,
            message: proc.title,
            severity,
            linkPath: `/operaciones/procedimientos/${c.procedureId}`,
            icon: 'Bell',
          });
        }
        sent += 1;
      } catch (err) {
        this.logger.warn(
          `Failed to send reminder for ack ${c.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    return { sent };
  }

  /* ---- Read views --------------------------------------------- */

  async getMyPending(companyId: string, userId: string) {
    const rows = await this.prisma.procedureAcknowledgment.findMany({
      where: {
        companyId,
        userId,
        status: { in: ['PENDING', 'READ', 'EXPIRED'] },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      include: {
        procedure: {
          select: {
            id: true,
            code: true,
            title: true,
            description: true,
            category: true,
            version: true,
            estimatedReadingMinutes: true,
          },
        },
      },
    });
    return rows;
  }

  async getMyPendingCount(companyId: string, userId: string) {
    const count = await this.prisma.procedureAcknowledgment.count({
      where: {
        companyId,
        userId,
        status: { in: ['PENDING', 'READ', 'EXPIRED'] },
      },
    });
    return { count };
  }

  async findAll(companyId: string, actorUserId: string, filters: FilterAcknowledgmentsDto) {
    const where: Prisma.ProcedureAcknowledgmentWhereInput = { companyId };
    if (filters.status) where.status = filters.status;
    if (filters.procedureId) where.procedureId = filters.procedureId;
    if (filters.userId) where.userId = filters.userId;
    if (filters.dueWithinDays != null) {
      const horizon = new Date(Date.now() + filters.dueWithinDays * 86_400_000);
      where.dueDate = { lte: horizon };
    }
    if (filters.overdueOnly) {
      where.dueDate = { lt: new Date() };
      where.status = where.status ?? { in: ['PENDING', 'READ'] };
    }
    /* Admin/manager filter is handled by CASL — by the time we
       reach the service the caller is allowed. Non-admins still
       see only their own rows because their userId is auto-filtered
       at the controller. */
    return this.prisma.procedureAcknowledgment.findMany({
      where,
      orderBy: { dueDate: 'asc' },
      include: {
        procedure: {
          select: { id: true, code: true, title: true, category: true, version: true },
        },
      },
      take: 500,
    });
  }

  /* ---- Coverage reports --------------------------------------- */

  async getProcedureCoverage(companyId: string, procedureId: string) {
    const proc = await this.prisma.procedure.findFirst({
      where: { id: procedureId, companyId },
      select: {
        id: true,
        code: true,
        title: true,
        requiresAcknowledgment: true,
      },
    });
    if (!proc) throw new NotFoundException('Procedimiento no encontrado.');

    const rows = await this.prisma.procedureAcknowledgment.findMany({
      where: { companyId, procedureId },
      include: {
        procedure: { select: { id: true, code: true, title: true } },
      },
    });
    const userIds = [...new Set(rows.map((r) => r.userId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    const userById = new Map(users.map((u) => [u.id, u]));
    const memberships = await this.prisma.membership.findMany({
      where: { companyId, userId: { in: userIds } },
      select: { userId: true, role: true },
    });
    const roleByUser = new Map(memberships.map((m) => [m.userId, m.role as string]));

    const counts = this.tally(rows);
    const totalRequired = counts.acknowledged + counts.read + counts.pending + counts.expired;
    const coveragePercentage =
      totalRequired === 0 ? 100 : Math.round((counts.acknowledged / totalRequired) * 1000) / 10;

    const now = Date.now();
    const userBreakdown = rows.map((r) => {
      const u = userById.get(r.userId);
      const daysOverdue =
        r.status !== 'ACKNOWLEDGED' && r.dueDate
          ? Math.max(0, Math.floor((now - r.dueDate.getTime()) / 86_400_000))
          : 0;
      return {
        userId: r.userId,
        userName: u ? `${u.firstName} ${u.lastName}`.trim() || u.email : r.userId,
        userEmail: u?.email ?? null,
        role: roleByUser.get(r.userId) ?? null,
        status: r.status,
        acknowledgedAt: r.acknowledgedAt,
        dueDate: r.dueDate,
        daysOverdue,
      };
    });

    return {
      procedureId: proc.id,
      code: proc.code,
      title: proc.title,
      totalRequired,
      acknowledged: counts.acknowledged,
      pending: counts.pending,
      read: counts.read,
      expired: counts.expired,
      exempted: counts.exempted,
      coveragePercentage,
      users: userBreakdown,
    };
  }

  async getUserCoverage(companyId: string, userId: string) {
    const rows = await this.prisma.procedureAcknowledgment.findMany({
      where: { companyId, userId },
      include: {
        procedure: {
          select: { id: true, code: true, title: true, category: true, version: true },
        },
      },
      orderBy: { dueDate: 'asc' },
    });
    const counts = this.tally(rows);
    const total = counts.acknowledged + counts.read + counts.pending + counts.expired;
    const coveragePercentage =
      total === 0 ? 100 : Math.round((counts.acknowledged / total) * 1000) / 10;
    return {
      userId,
      totalAssigned: total,
      acknowledged: counts.acknowledged,
      pending: counts.pending,
      read: counts.read,
      expired: counts.expired,
      exempted: counts.exempted,
      coveragePercentage,
      procedures: rows,
    };
  }

  async getCompanyCoverage(companyId: string) {
    const rows = await this.prisma.procedureAcknowledgment.findMany({
      where: { companyId },
      select: {
        id: true,
        userId: true,
        procedureId: true,
        status: true,
        procedure: { select: { category: true } },
      },
    });
    const counts = this.tally(rows);
    const total = counts.acknowledged + counts.read + counts.pending + counts.expired;
    const coveragePercentage =
      total === 0 ? 100 : Math.round((counts.acknowledged / total) * 1000) / 10;

    /* Per-category aggregate. */
    const byCategory = new Map<string, { total: number; acknowledged: number }>();
    for (const r of rows) {
      const key = r.procedure?.category ?? 'OTHER';
      const slot = byCategory.get(key) ?? { total: 0, acknowledged: 0 };
      slot.total += 1;
      if (r.status === 'ACKNOWLEDGED') slot.acknowledged += 1;
      byCategory.set(key, slot);
    }

    /* Procedures with the worst coverage (top 5). */
    const byProcedure = new Map<string, { total: number; acknowledged: number }>();
    for (const r of rows) {
      const slot = byProcedure.get(r.procedureId) ?? { total: 0, acknowledged: 0 };
      slot.total += 1;
      if (r.status === 'ACKNOWLEDGED') slot.acknowledged += 1;
      byProcedure.set(r.procedureId, slot);
    }
    const worstProcedures = [...byProcedure.entries()]
      .map(([procedureId, slot]) => ({
        procedureId,
        total: slot.total,
        acknowledged: slot.acknowledged,
        coverage: slot.total === 0 ? 100 : Math.round((slot.acknowledged / slot.total) * 1000) / 10,
      }))
      .sort((a, b) => a.coverage - b.coverage)
      .slice(0, 5);

    /* Users with the most pending. */
    const byUser = new Map<string, number>();
    for (const r of rows) {
      if (r.status === 'PENDING' || r.status === 'READ' || r.status === 'EXPIRED') {
        byUser.set(r.userId, (byUser.get(r.userId) ?? 0) + 1);
      }
    }
    const topUsers = [...byUser.entries()]
      .map(([userId, pending]) => ({ userId, pending }))
      .sort((a, b) => b.pending - a.pending)
      .slice(0, 5);

    /* Hydrate the worst procedures + top users with names. */
    const [procedureMeta, userMeta] = await Promise.all([
      this.prisma.procedure.findMany({
        where: { id: { in: worstProcedures.map((p) => p.procedureId) } },
        select: { id: true, code: true, title: true },
      }),
      this.prisma.user.findMany({
        where: { id: { in: topUsers.map((u) => u.userId) } },
        select: { id: true, firstName: true, lastName: true, email: true },
      }),
    ]);

    return {
      totalAssignments: total,
      acknowledged: counts.acknowledged,
      pending: counts.pending,
      read: counts.read,
      expired: counts.expired,
      exempted: counts.exempted,
      coveragePercentage,
      byCategory: Object.fromEntries(
        [...byCategory.entries()].map(([k, v]) => [
          k,
          {
            ...v,
            coverage: v.total === 0 ? 100 : Math.round((v.acknowledged / v.total) * 1000) / 10,
          },
        ]),
      ),
      worstProcedures: worstProcedures.map((p) => ({
        ...p,
        ...(procedureMeta.find((m) => m.id === p.procedureId) ?? { code: '?', title: '?' }),
      })),
      topUsersWithPending: topUsers.map((u) => {
        const m = userMeta.find((x) => x.id === u.userId);
        return {
          ...u,
          name: m ? `${m.firstName} ${m.lastName}`.trim() || m.email : u.userId,
          email: m?.email ?? null,
        };
      }),
    };
  }

  /* ---- Helpers ----------------------------------------------- */

  /* Derives the union of users targeted by a procedure's
     applicability rules. We resolve in two passes: roles +
     assigned users on listed assets/types/locations. */
  private async resolveTargetUsers(
    companyId: string,
    targets: {
      applicableRoles: string[];
      applicableAssetIds: string[];
      applicableAssetTypeIds: string[];
      applicableLocationIds: string[];
    },
  ): Promise<Set<string>> {
    const out = new Set<string>();

    if (targets.applicableRoles.length > 0) {
      const memberships = await this.prisma.membership.findMany({
        where: {
          companyId,
          isActive: true,
          role: {
            in: targets.applicableRoles.filter((r): r is UserRole =>
              ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'ANALYST', 'VIEWER'].includes(r),
            ),
          },
        },
        select: { userId: true },
      });
      for (const m of memberships) out.add(m.userId);
    }

    /* Assets pre-selected by id or by type or by location.
       We collect assignedToUserId (typed as string?). */
    const assetWhere: Prisma.OperationalAssetWhereInput = { companyId, isActive: true };
    const ors: Prisma.OperationalAssetWhereInput[] = [];
    if (targets.applicableAssetIds.length > 0) {
      ors.push({ id: { in: targets.applicableAssetIds } });
    }
    if (targets.applicableAssetTypeIds.length > 0) {
      ors.push({ assetTypeId: { in: targets.applicableAssetTypeIds } });
    }
    if (targets.applicableLocationIds.length > 0) {
      ors.push({ locationId: { in: targets.applicableLocationIds } });
    }
    if (ors.length > 0) {
      assetWhere.OR = ors;
      const assets = await this.prisma.operationalAsset.findMany({
        where: assetWhere,
        select: { assignedToUserId: true },
      });
      for (const a of assets) {
        if (a.assignedToUserId) out.add(a.assignedToUserId);
      }
    }

    return out;
  }

  private signatureHash(
    procedureId: string,
    userId: string,
    timestamp: Date,
    notes: string | null,
  ): string {
    return createHash('sha256')
      .update(`${procedureId}|${userId}|${timestamp.toISOString()}|${notes ?? ''}`)
      .digest('hex');
  }

  private tally(rows: Array<{ status: AcknowledgmentStatus }>): {
    acknowledged: number;
    read: number;
    pending: number;
    expired: number;
    exempted: number;
  } {
    const out = { acknowledged: 0, read: 0, pending: 0, expired: 0, exempted: 0 };
    for (const r of rows) {
      if (r.status === 'ACKNOWLEDGED') out.acknowledged += 1;
      else if (r.status === 'READ') out.read += 1;
      else if (r.status === 'PENDING') out.pending += 1;
      else if (r.status === 'EXPIRED') out.expired += 1;
      else if (r.status === 'EXEMPTED') out.exempted += 1;
    }
    return out;
  }

  private async userRoleInCompany(userId: string, companyId: string): Promise<string | null> {
    const m = await this.prisma.membership.findFirst({
      where: { userId, companyId, isActive: true },
      select: { role: true },
    });
    return m?.role ?? null;
  }
}
