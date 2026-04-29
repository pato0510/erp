import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AssetStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { AssetBlockingService } from '../alerts/asset-blocking.service';
import { NotificationService } from '../notifications/notification.service';
import { ApproveExceptionDto } from './dto/approve-exception.dto';
import { FilterExceptionsDto } from './dto/filter-exceptions.dto';
import { RejectExceptionDto } from './dto/reject-exception.dto';
import { RequestExceptionDto } from './dto/request-exception.dto';
import { RevokeExceptionDto } from './dto/revoke-exception.dto';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_EXCEPTION_DAYS = 90;
const ENGINE_USER_ID = '00000000-0000-0000-0000-000000000000';

@Injectable()
export class ExceptionsService {
  private readonly logger = new Logger(ExceptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
    private readonly blockingService: AssetBlockingService,
    private readonly notificationService: NotificationService,
  ) {}

  async findAll(companyId: string, filters: FilterExceptionsDto) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, filters.limit ?? DEFAULT_LIMIT));
    const skip = (page - 1) * limit;

    const where: Prisma.AssetExceptionWhereInput = { companyId };
    if (filters.status) where.status = filters.status;
    if (filters.assetId) where.assetId = filters.assetId;
    if (filters.requestedBy) where.requestedBy = filters.requestedBy;

    const [rows, total] = await Promise.all([
      this.prisma.assetException.findMany({
        where,
        include: {
          asset: {
            select: {
              id: true,
              code: true,
              name: true,
              status: true,
              assetType: { select: { id: true, name: true, category: true } },
            },
          },
        },
        orderBy: [{ status: 'asc' }, { requestedAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.assetException.count({ where }),
    ]);

    /* Hydrate user info in a single batched query — same pattern as
       other services that store actor IDs as bare UUIDs. */
    const userIds = new Set<string>();
    for (const r of rows) {
      userIds.add(r.requestedBy);
      if (r.approvedBy) userIds.add(r.approvedBy);
      if (r.rejectedBy) userIds.add(r.rejectedBy);
      if (r.revokedBy) userIds.add(r.revokedBy);
    }
    const users = userIds.size
      ? await this.prisma.user.findMany({
          where: { id: { in: Array.from(userIds) } },
          select: { id: true, email: true, firstName: true, lastName: true },
        })
      : [];
    const userById = new Map(users.map((u) => [u.id, u]));

    /* Document type names in batch too. */
    const docTypeIds = Array.from(new Set(rows.flatMap((r) => r.requestedDocumentTypeIds)));
    const docTypes = docTypeIds.length
      ? await this.prisma.operationalDocumentType.findMany({
          where: { id: { in: docTypeIds } },
          select: { id: true, name: true, code: true },
        })
      : [];
    const docTypeById = new Map(docTypes.map((d) => [d.id, d]));

    return {
      data: rows.map((r) => this.hydrate(r, userById, docTypeById)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findOne(id: string, companyId: string) {
    const row = await this.prisma.assetException.findFirst({
      where: { id, companyId },
      include: {
        asset: {
          select: {
            id: true,
            code: true,
            name: true,
            status: true,
            assetType: { select: { id: true, name: true, category: true } },
          },
        },
      },
    });
    if (!row) throw new NotFoundException('Excepción no encontrada.');
    const userIds = [row.requestedBy, row.approvedBy, row.rejectedBy, row.revokedBy].filter(
      (u): u is string => !!u,
    );
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true, firstName: true, lastName: true },
        })
      : [];
    const userById = new Map(users.map((u) => [u.id, u]));
    const docTypes = row.requestedDocumentTypeIds.length
      ? await this.prisma.operationalDocumentType.findMany({
          where: { id: { in: row.requestedDocumentTypeIds } },
          select: { id: true, name: true, code: true },
        })
      : [];
    const docTypeById = new Map(docTypes.map((d) => [d.id, d]));
    return this.hydrate(row, userById, docTypeById);
  }

  /* OPS-023 — request creation. Status starts at PENDING and notifies
     all ADMIN-role users so somebody picks it up. We snapshot the
     blocking documents at request time so the admin sees what was
     pending at the moment of request, even if the gap shifts later. */
  async requestException(companyId: string, userId: string, dto: RequestExceptionDto) {
    const asset = await this.prisma.operationalAsset.findFirst({
      where: { id: dto.assetId, companyId },
      select: { id: true, code: true, name: true, status: true },
    });
    if (!asset) throw new BadRequestException('El activo no existe en esta empresa.');
    if (asset.status !== 'BLOCKED_DOCUMENTAL') {
      throw new BadRequestException(
        'Solo se pueden solicitar excepciones para activos bloqueados.',
      );
    }
    const existing = await this.prisma.assetException.findFirst({
      where: {
        companyId,
        assetId: asset.id,
        status: { in: ['PENDING', 'APPROVED'] },
      },
      select: { id: true, status: true },
    });
    if (existing) {
      throw new ConflictException('Este activo ya tiene una excepción activa o pendiente.');
    }

    const proposed = new Date(dto.proposedValidUntil);
    if (Number.isNaN(proposed.getTime())) {
      throw new BadRequestException('La fecha propuesta no es válida.');
    }
    const maxAhead = new Date(Date.now() + MAX_EXCEPTION_DAYS * 24 * 3600_000);
    if (proposed > maxAhead) {
      throw new BadRequestException(
        `La excepción no puede extenderse más de ${MAX_EXCEPTION_DAYS} días.`,
      );
    }

    /* Snapshot the current blocking gaps so the admin reviewing the
       request sees exactly what was pending. */
    const evaluation = await this.blockingService.evaluateAssetBlocking(companyId, asset.id);

    const created = await this.rlsService.executeWithRls(companyId, userId, async (tx) =>
      tx.assetException.create({
        data: {
          companyId,
          assetId: asset.id,
          requestedBy: userId,
          requestedReason: dto.reason.trim(),
          requestedDocumentTypeIds: evaluation.blockingDocumentTypeIds,
          status: 'PENDING',
          /* Stash the proposed validUntil even though it's the
             requester's preference — admins can override on approve. */
          validUntil: proposed,
        },
      }),
    );

    /* Notify every admin in the company so somebody acts on the
       request. We use createGeneric with a synthetic role list. */
    try {
      const memberships = await this.prisma.membership.findMany({
        where: { companyId, isActive: true, role: 'ADMIN' },
        select: { userId: true },
      });
      const adminIds = Array.from(new Set(memberships.map((m) => m.userId)));
      if (adminIds.length > 0) {
        const snippet = dto.reason.trim().slice(0, 140);
        await this.notificationService.createGeneric(companyId, {
          userIds: adminIds,
          sourceType: 'EXCEPTION_REQUESTED',
          title: `Solicitud de excepción — ${asset.name}`,
          message: snippet,
          severity: 'WARNING',
          linkPath: `/operaciones/excepciones?id=${created.id}`,
          icon: 'ShieldOff',
        });
      }
    } catch (err) {
      this.logger.warn(
        `Notification fan-out failed for exception ${created.id}: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }

    return created;
  }

  async approve(id: string, companyId: string, userId: string, dto: ApproveExceptionDto) {
    const ex = await this.prisma.assetException.findFirst({
      where: { id, companyId },
      include: {
        asset: { select: { id: true, code: true, name: true, status: true } },
      },
    });
    if (!ex) throw new NotFoundException('Excepción no encontrada.');
    if (ex.status !== 'PENDING') {
      throw new BadRequestException('Sólo se pueden aprobar excepciones en estado PENDIENTE.');
    }

    const validFrom = dto.validFrom ? new Date(dto.validFrom) : new Date();
    const validUntil = new Date(dto.validUntil);
    if (Number.isNaN(validFrom.getTime()) || Number.isNaN(validUntil.getTime())) {
      throw new BadRequestException('Fechas de vigencia inválidas.');
    }
    if (validUntil <= new Date()) {
      throw new BadRequestException('La fecha de fin debe ser futura.');
    }
    /* Cap the window at 90 days from validFrom — admins shouldn't be
       able to write a permanent unblock through this path. */
    const maxEnd = new Date(validFrom.getTime() + MAX_EXCEPTION_DAYS * 24 * 3600_000);
    if (validUntil > maxEnd) {
      throw new BadRequestException(
        `La excepción no puede extenderse más de ${MAX_EXCEPTION_DAYS} días desde la fecha de inicio.`,
      );
    }

    const previousStatus: AssetStatus = ex.asset.status;

    /* The asset should currently be BLOCKED_DOCUMENTAL — if an admin
       manually pre-unblocked it, we still proceed but log a warning so
       the audit trail captures the surprise. */
    const targetStatus: AssetStatus = 'OPERATIONAL';
    const reason = `Excepción temporal aprobada hasta ${validUntil.toISOString().slice(0, 10)}`;

    await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      await tx.assetException.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedBy: userId,
          approvedReason: dto.approvedReason?.trim() ?? null,
          approvedAt: new Date(),
          validFrom,
          validUntil,
          previousStatus,
        },
      });
      await tx.operationalAsset.update({
        where: { id: ex.assetId },
        data: {
          status: targetStatus,
          statusReason: reason,
          statusChangedAt: new Date(),
        },
      });
      await tx.assetStatusChange.create({
        data: {
          companyId,
          assetId: ex.assetId,
          previousStatus,
          newStatus: targetStatus,
          changeType: 'EXCEPTION_GRANTED',
          reason,
          changedBy: userId,
          metadata: { exceptionId: id } as Prisma.InputJsonValue,
        },
      });
    });

    /* Notify the requester so they don't keep refreshing. */
    try {
      await this.notificationService.createGeneric(companyId, {
        userIds: [ex.requestedBy],
        sourceType: 'EXCEPTION_GRANTED',
        title: `Excepción aprobada — ${ex.asset.name}`,
        message:
          dto.approvedReason?.trim() || `Vigente hasta ${validUntil.toISOString().slice(0, 10)}.`,
        severity: 'INFO',
        linkPath: `/operaciones/excepciones?id=${id}`,
        icon: 'ShieldOff',
      });
    } catch (err) {
      this.logger.warn(
        `Approve notification failed for exception ${id}: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }

    return this.findOne(id, companyId);
  }

  async reject(id: string, companyId: string, userId: string, dto: RejectExceptionDto) {
    const ex = await this.prisma.assetException.findFirst({
      where: { id, companyId },
      select: { id: true, status: true, requestedBy: true, asset: { select: { name: true } } },
    });
    if (!ex) throw new NotFoundException('Excepción no encontrada.');
    if (ex.status !== 'PENDING') {
      throw new BadRequestException('Sólo se pueden rechazar excepciones pendientes.');
    }
    await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      await tx.assetException.update({
        where: { id },
        data: {
          status: 'REJECTED',
          rejectedBy: userId,
          rejectedReason: dto.rejectedReason.trim(),
          rejectedAt: new Date(),
        },
      });
    });
    try {
      await this.notificationService.createGeneric(companyId, {
        userIds: [ex.requestedBy],
        sourceType: 'GENERAL',
        title: `Excepción rechazada — ${ex.asset.name}`,
        message: dto.rejectedReason.trim(),
        severity: 'WARNING',
        linkPath: `/operaciones/excepciones?id=${id}`,
        icon: 'ShieldOff',
      });
    } catch (err) {
      this.logger.warn(
        `Reject notification failed for exception ${id}: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
    return this.findOne(id, companyId);
  }

  async revoke(id: string, companyId: string, userId: string, dto: RevokeExceptionDto) {
    const ex = await this.prisma.assetException.findFirst({
      where: { id, companyId },
      include: {
        asset: { select: { id: true, name: true } },
      },
    });
    if (!ex) throw new NotFoundException('Excepción no encontrada.');
    if (ex.status !== 'APPROVED') {
      throw new BadRequestException('Sólo se pueden revocar excepciones aprobadas.');
    }
    await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      await tx.assetException.update({
        where: { id },
        data: {
          status: 'REVOKED',
          revokedBy: userId,
          revokedReason: dto.revokedReason.trim(),
          revokedAt: new Date(),
        },
      });
    });

    /* Re-evaluate immediately. The blocking service decides whether
       to re-block or leave as-is — we don't pre-judge. */
    let reblocked = false;
    try {
      const result = await this.blockingService.processBlocking(companyId, ex.assetId, userId);
      reblocked = result.action === 'BLOCKED';
    } catch (err) {
      this.logger.warn(
        `Re-block evaluation after revoke failed: ${err instanceof Error ? err.message : err}`,
      );
    }

    try {
      await this.notificationService.createGeneric(companyId, {
        userIds: Array.from(new Set([ex.requestedBy])),
        sourceType: 'GENERAL',
        title: `Excepción revocada — ${ex.asset.name}`,
        message: reblocked
          ? `${dto.revokedReason.trim()} El activo fue re-bloqueado automáticamente.`
          : dto.revokedReason.trim(),
        severity: reblocked ? 'CRITICAL' : 'WARNING',
        linkPath: `/operaciones/excepciones?id=${id}`,
        icon: 'ShieldOff',
      });
    } catch (err) {
      this.logger.warn(
        `Revoke notification failed for exception ${id}: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }

    return { ...(await this.findOne(id, companyId)), reblocked };
  }

  /* OPS-023 — hourly cron entry point. Walks every APPROVED
     exception whose validUntil has passed and hasn't been handled,
     marks it EXPIRED, then re-runs the blocking evaluation so the
     asset returns to BLOCKED_DOCUMENTAL if conditions still apply. */
  async processExpired(companyId: string) {
    const now = new Date();
    const candidates = await this.prisma.assetException.findMany({
      where: {
        companyId,
        status: 'APPROVED',
        expiresHandled: false,
        validUntil: { lt: now },
      },
      select: {
        id: true,
        assetId: true,
        previousStatus: true,
        requestedBy: true,
        approvedBy: true,
        asset: { select: { id: true, name: true, status: true } },
      },
    });
    let processed = 0;
    let reblocked = 0;
    for (const ex of candidates) {
      try {
        await this.rlsService.executeWithRls(companyId, ENGINE_USER_ID, async (tx) => {
          await tx.assetException.update({
            where: { id: ex.id },
            data: { status: 'EXPIRED', expiresHandled: true },
          });
          /* Audit trail for the auto-expiration before the blocking
             service writes its own AUTO_BLOCK row (if reblock fires). */
          await tx.assetStatusChange.create({
            data: {
              companyId,
              assetId: ex.assetId,
              previousStatus: ex.asset.status,
              newStatus: ex.asset.status,
              changeType: 'EXCEPTION_EXPIRED',
              reason: 'Excepción temporal expiró automáticamente.',
              changedBy: null,
              metadata: { exceptionId: ex.id } as Prisma.InputJsonValue,
            },
          });
        });
        const result = await this.blockingService.processBlocking(companyId, ex.assetId, null);
        if (result.action === 'BLOCKED') reblocked++;

        /* Ping the requester + admins so they know the exception
           finished its run. */
        const memberships = await this.prisma.membership.findMany({
          where: { companyId, isActive: true, role: 'ADMIN' },
          select: { userId: true },
        });
        const targets = new Set<string>(memberships.map((m) => m.userId));
        targets.add(ex.requestedBy);
        if (targets.size > 0) {
          await this.notificationService.createGeneric(companyId, {
            userIds: Array.from(targets),
            sourceType: 'GENERAL',
            title: `Excepción expirada — ${ex.asset.name}`,
            message:
              result.action === 'BLOCKED'
                ? 'El activo fue re-bloqueado automáticamente al expirar la excepción.'
                : 'La excepción terminó. El activo no requirió re-bloqueo.',
            severity: result.action === 'BLOCKED' ? 'BLOCKING' : 'INFO',
            linkPath: `/operaciones/excepciones?id=${ex.id}`,
            icon: 'ShieldOff',
          });
        }
        processed++;
      } catch (err) {
        this.logger.error(
          `Exception expiration failed for ${ex.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    return { processed, reblocked };
  }

  async processAllCompaniesExpired() {
    const companies = await this.prisma.company.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    const out: Array<{ companyId: string; processed: number; reblocked: number }> = [];
    for (const c of companies) {
      try {
        const r = await this.processExpired(c.id);
        out.push({ companyId: c.id, ...r });
      } catch (err) {
        this.logger.error(
          `Exception expiration sweep failed for company ${c.id}: ${
            err instanceof Error ? err.message : err
          }`,
        );
      }
    }
    return out;
  }

  async getActiveForAsset(companyId: string, assetId: string) {
    const row = await this.prisma.assetException.findFirst({
      where: { companyId, assetId, status: 'APPROVED' },
      orderBy: { approvedAt: 'desc' },
    });
    if (!row) return null;
    return this.findOne(row.id, companyId);
  }

  async getPendingCount(companyId: string) {
    const count = await this.prisma.assetException.count({
      where: { companyId, status: 'PENDING' },
    });
    return { count };
  }

  /* Hydration helper used by both findAll and findOne. Decorates the
     raw row with resolved user objects and document type names. */
  private hydrate(
    row: Prisma.AssetExceptionGetPayload<{
      include: {
        asset: {
          select: {
            id: true;
            code: true;
            name: true;
            status: true;
            assetType: { select: { id: true; name: true; category: true } };
          };
        };
      };
    }>,
    userById: Map<string, { id: string; email: string; firstName: string; lastName: string }>,
    docTypeById: Map<string, { id: string; name: string; code: string }>,
  ) {
    return {
      ...row,
      requestedByUser: userById.get(row.requestedBy) ?? null,
      approvedByUser: row.approvedBy ? (userById.get(row.approvedBy) ?? null) : null,
      rejectedByUser: row.rejectedBy ? (userById.get(row.rejectedBy) ?? null) : null,
      revokedByUser: row.revokedBy ? (userById.get(row.revokedBy) ?? null) : null,
      requestedDocumentTypes: row.requestedDocumentTypeIds
        .map((id) => docTypeById.get(id))
        .filter((d): d is { id: string; name: string; code: string } => !!d),
    };
  }
}
