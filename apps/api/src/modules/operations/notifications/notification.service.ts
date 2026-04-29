import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AlertInstance, AlertTriggerType, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { FilterNotificationsDto } from './dto/filter-notifications.dto';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

interface AlertInstanceForNotification extends AlertInstance {
  /* Optional — when present, used in title/message instead of the
     stored snapshot so re-emit reflects the latest data. */
  asset?: { code: string; name: string } | null;
  documentType?: { name: string } | null;
}

const TRIGGER_ICON: Record<AlertTriggerType, string> = {
  EXPIRING_SOON: 'AlertTriangle',
  EXPIRED: 'AlertCircle',
  MISSING: 'HelpCircle',
  BLOCKING: 'Ban',
};

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  /* OPS-022 — fan-out for alert engine. Resolves the rule's
     notifiedRoles + notifiedUsers + assignedUser into a deduped user
     list, then writes one UserNotification per recipient. We swallow
     individual errors so a single bad user id doesn't kill the whole
     fan-out — the engine will retry on the next pass anyway. */
  async createForAlertInstance(
    companyId: string,
    alert: AlertInstanceForNotification,
  ): Promise<{ delivered: number }> {
    const targetIds = await this.resolveAlertRecipients(companyId, alert);
    if (targetIds.length === 0) return { delivered: 0 };

    const linkPath = `/operaciones/alertas?alertId=${alert.id}`;
    const icon = TRIGGER_ICON[alert.triggerType] ?? 'Bell';

    let delivered = 0;
    for (const userId of targetIds) {
      try {
        await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
          await tx.userNotification.create({
            data: {
              companyId,
              userId,
              alertInstanceId: alert.id,
              sourceType: 'ALERT_INSTANCE',
              title: alert.title,
              message: alert.message,
              severity: alert.severity,
              linkPath,
              icon,
            },
          });
        });
        delivered++;
      } catch (err) {
        this.logger.warn(
          `Notification fan-out skipped user ${userId} for alert ${alert.id}: ${
            err instanceof Error ? err.message : err
          }`,
        );
      }
    }
    return { delivered };
  }

  /* OPS-022 — auto-block fan-out. Notifies admins, managers, and the
     asset's assigned user (if any) when an asset transitions to
     BLOCKED_DOCUMENTAL. The role list is hard-coded here because the
     blocking flow doesn't carry a rule context like the alert engine
     does. */
  async createForAssetBlocked(
    companyId: string,
    assetId: string,
    blockingDocumentTypeIds: string[],
  ): Promise<{ delivered: number }> {
    const asset = await this.prisma.operationalAsset.findFirst({
      where: { id: assetId, companyId },
      select: {
        id: true,
        code: true,
        name: true,
        assignedToUserId: true,
        assetType: { select: { category: true } },
      },
    });
    if (!asset) return { delivered: 0 };

    const docTypes = blockingDocumentTypeIds.length
      ? await this.prisma.operationalDocumentType.findMany({
          where: { id: { in: blockingDocumentTypeIds }, companyId },
          select: { name: true, code: true },
        })
      : [];

    /* Admins + Managers see every block; the assigned operator gets a
       direct ping so they aren't surprised when they show up to work
       the next morning. */
    const userIds = await this.resolveRoleUsers(companyId, ['ADMIN', 'MANAGER']);
    if (asset.assignedToUserId) userIds.add(asset.assignedToUserId);

    const isVehicle = (asset.assetType?.category ?? '').toUpperCase() === 'VEHICLE';
    const linkPath = isVehicle ? `/operaciones/vehiculos` : `/operaciones/equipos/${asset.id}`;

    const docList =
      docTypes.length > 0
        ? `Documentos bloqueantes: ${docTypes.map((d) => d.code).join(', ')}.`
        : 'Documentos bloqueantes vencidos o faltantes.';

    let delivered = 0;
    for (const userId of userIds) {
      try {
        await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
          await tx.userNotification.create({
            data: {
              companyId,
              userId,
              sourceType: 'ASSET_BLOCKED',
              title: `Activo bloqueado: ${asset.name}`,
              message: docList,
              severity: 'BLOCKING',
              linkPath,
              icon: 'Ban',
            },
          });
        });
        delivered++;
      } catch (err) {
        this.logger.warn(
          `Asset-block fan-out skipped user ${userId}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    return { delivered };
  }

  /* Generic broadcast — used by escalation and any future flow that
     needs to ping a known user list. */
  async createGeneric(
    companyId: string,
    dto: CreateNotificationDto,
    options: { alertInstanceId?: string } = {},
  ): Promise<{ delivered: number }> {
    let delivered = 0;
    for (const userId of dto.userIds) {
      try {
        await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
          await tx.userNotification.create({
            data: {
              companyId,
              userId,
              alertInstanceId: options.alertInstanceId ?? null,
              sourceType: dto.sourceType,
              title: dto.title,
              message: dto.message ?? null,
              severity: dto.severity,
              linkPath: dto.linkPath ?? null,
              icon: dto.icon ?? null,
            },
          });
        });
        delivered++;
      } catch (err) {
        this.logger.warn(
          `Generic notification skipped user ${userId}: ${
            err instanceof Error ? err.message : err
          }`,
        );
      }
    }
    return { delivered };
  }

  /* User-scoped read endpoints. RlsService sets rls.user_id so the
     policy already enforces ownership; we still pass userId through
     the where clause as defense-in-depth. */
  async findAll(companyId: string, userId: string, filters: FilterNotificationsDto) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, filters.limit ?? DEFAULT_LIMIT));
    const skip = (page - 1) * limit;

    const where: Prisma.UserNotificationWhereInput = { companyId, userId };
    if (filters.isRead !== undefined) where.isRead = filters.isRead;
    if (filters.isDismissed !== undefined) where.isDismissed = filters.isDismissed;
    if (filters.severity) where.severity = filters.severity;
    if (filters.sourceType) where.sourceType = filters.sourceType;

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const [rows, total, unreadCount] = await Promise.all([
        tx.userNotification.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          include: {
            alertInstance: {
              select: {
                id: true,
                title: true,
                severity: true,
                triggerType: true,
                status: true,
                triggeredAt: true,
                asset: { select: { id: true, code: true, name: true } },
                documentType: { select: { id: true, name: true, code: true } },
              },
            },
          },
        }),
        tx.userNotification.count({ where }),
        tx.userNotification.count({
          where: { companyId, userId, isRead: false, isDismissed: false },
        }),
      ]);
      return {
        data: rows,
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        unreadCount,
      };
    });
  }

  async getUnreadCount(companyId: string, userId: string) {
    const count = await this.rlsService.executeWithRls(companyId, userId, async (tx) =>
      tx.userNotification.count({
        where: { companyId, userId, isRead: false, isDismissed: false },
      }),
    );
    return { count };
  }

  async markAsRead(id: string, companyId: string, userId: string) {
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const existing = await tx.userNotification.findFirst({
        where: { id, companyId, userId },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException('Notificación no encontrada.');
      return tx.userNotification.update({
        where: { id },
        data: { isRead: true, readAt: new Date() },
      });
    });
  }

  async markAllAsRead(companyId: string, userId: string) {
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const result = await tx.userNotification.updateMany({
        where: { companyId, userId, isRead: false },
        data: { isRead: true, readAt: new Date() },
      });
      return { updated: result.count };
    });
  }

  async dismiss(id: string, companyId: string, userId: string) {
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const existing = await tx.userNotification.findFirst({
        where: { id, companyId, userId },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException('Notificación no encontrada.');
      return tx.userNotification.update({
        where: { id },
        data: { isDismissed: true, dismissedAt: new Date(), isRead: true, readAt: new Date() },
      });
    });
  }

  /* Helpers ---------------------------------------------------------- */

  private async resolveAlertRecipients(
    companyId: string,
    alert: AlertInstanceForNotification,
  ): Promise<string[]> {
    const targets = new Set<string>();
    /* notifiedUsers is already a list of UUIDs (assigned user, etc.). */
    for (const u of alert.notifiedUsers) {
      if (u && u !== SYSTEM_USER_ID) targets.add(u);
    }
    if (alert.notifiedRoles.length > 0) {
      const ids = await this.resolveRoleUsers(companyId, alert.notifiedRoles);
      ids.forEach((id) => targets.add(id));
    }
    /* If the alert was generated for an asset with an assigned user we
       fetch it lazily and add. The engine usually pre-filled
       notifiedUsers but this is a belt-and-braces guard. */
    if (alert.assetId) {
      const asset = await this.prisma.operationalAsset.findFirst({
        where: { id: alert.assetId, companyId },
        select: { assignedToUserId: true },
      });
      if (asset?.assignedToUserId) targets.add(asset.assignedToUserId);
    }
    return Array.from(targets);
  }

  /* Looks up active memberships for the given roles in this company.
     Returns user IDs as a Set so callers can union with other sources
     without double-paying for the dedupe. */
  private async resolveRoleUsers(companyId: string, roles: string[]): Promise<Set<string>> {
    if (roles.length === 0) return new Set();
    const validRoles = roles
      .map((r) => r.toUpperCase())
      .filter((r): r is 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'ACCOUNTANT' | 'ANALYST' | 'VIEWER' =>
        ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'ANALYST', 'VIEWER'].includes(r),
      );
    if (validRoles.length === 0) return new Set();
    const memberships = await this.prisma.membership.findMany({
      where: { companyId, isActive: true, role: { in: validRoles } },
      select: { userId: true },
    });
    return new Set(memberships.map((m) => m.userId));
  }

  /* Internal use only — bypasses RLS-safe helpers for the auth layer
     where we already know the caller. Currently used nowhere directly;
     exported in case a controller wants to surface "delete forever". */
  async forceDelete(id: string, companyId: string, userId: string) {
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const existing = await tx.userNotification.findFirst({
        where: { id, companyId, userId },
        select: { id: true },
      });
      if (!existing) throw new ForbiddenException('No autorizado.');
      await tx.userNotification.delete({ where: { id } });
      return { id };
    });
  }
}
