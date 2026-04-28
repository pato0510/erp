import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AlertSeverity, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import {
  DismissAlertInstanceDto,
  FilterAlertInstancesDto,
  ResolveAlertInstanceDto,
} from './dto/filter-alert-instances.dto';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

@Injectable()
export class AlertInstancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  async findAll(companyId: string, filters: FilterAlertInstancesDto) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, filters.limit ?? DEFAULT_LIMIT));
    const skip = (page - 1) * limit;

    const where: Prisma.AlertInstanceWhereInput = { companyId };
    if (filters.status) where.status = filters.status;
    if (filters.severity) where.severity = filters.severity;
    if (filters.triggerType) where.triggerType = filters.triggerType;
    if (filters.assetId) where.assetId = filters.assetId;
    if (filters.documentTypeId) where.documentTypeId = filters.documentTypeId;

    const [rows, total] = await Promise.all([
      this.prisma.alertInstance.findMany({
        where,
        include: {
          asset: { select: { id: true, code: true, name: true, status: true } },
          documentType: { select: { id: true, code: true, name: true, category: true } },
          documentRecord: {
            select: { id: true, fileName: true, version: true, status: true, expirationDate: true },
          },
        },
        orderBy: { triggeredAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.alertInstance.count({ where }),
    ]);

    return {
      data: rows,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findOne(id: string, companyId: string) {
    const row = await this.prisma.alertInstance.findFirst({
      where: { id, companyId },
      include: {
        asset: { select: { id: true, code: true, name: true, status: true } },
        documentType: true,
        documentRecord: true,
        alertRule: { select: { id: true, name: true, severity: true } },
      },
    });
    if (!row) throw new NotFoundException('Alerta no encontrada.');
    return row;
  }

  async acknowledge(id: string, companyId: string, userId: string) {
    const existing = await this.prisma.alertInstance.findFirst({
      where: { id, companyId },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException('Alerta no encontrada.');
    if (existing.status !== 'ACTIVE' && existing.status !== 'ESCALATED') {
      throw new BadRequestException('Sólo se pueden reconocer alertas activas o escaladas.');
    }
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.alertInstance.update({
        where: { id },
        data: {
          status: 'ACKNOWLEDGED',
          acknowledgedBy: userId,
          acknowledgedAt: new Date(),
        },
      });
    });
  }

  async resolve(id: string, companyId: string, userId: string, dto: ResolveAlertInstanceDto) {
    const existing = await this.prisma.alertInstance.findFirst({
      where: { id, companyId },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException('Alerta no encontrada.');
    if (existing.status === 'RESOLVED' || existing.status === 'DISMISSED') {
      throw new BadRequestException('La alerta ya fue cerrada.');
    }
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.alertInstance.update({
        where: { id },
        data: {
          status: 'RESOLVED',
          resolvedBy: userId,
          resolvedAt: new Date(),
          resolvedReason: dto.reason ?? null,
        },
      });
    });
  }

  async dismiss(id: string, companyId: string, userId: string, dto: DismissAlertInstanceDto) {
    if (!dto.reason || dto.reason.trim().length < 5) {
      throw new BadRequestException('Indica un motivo (mínimo 5 caracteres).');
    }
    const existing = await this.prisma.alertInstance.findFirst({
      where: { id, companyId },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException('Alerta no encontrada.');
    if (existing.status === 'RESOLVED' || existing.status === 'DISMISSED') {
      throw new BadRequestException('La alerta ya fue cerrada.');
    }
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.alertInstance.update({
        where: { id },
        data: {
          status: 'DISMISSED',
          resolvedBy: userId,
          resolvedAt: new Date(),
          resolvedReason: dto.reason,
        },
      });
    });
  }

  async bulkAcknowledge(companyId: string, userId: string, ids: string[]) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('Debes incluir al menos un id.');
    }
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const result = await tx.alertInstance.updateMany({
        where: {
          id: { in: ids },
          companyId,
          status: { in: ['ACTIVE', 'ESCALATED'] },
        },
        data: {
          status: 'ACKNOWLEDGED',
          acknowledgedBy: userId,
          acknowledgedAt: new Date(),
        },
      });
      return { updated: result.count };
    });
  }

  async bulkResolve(companyId: string, userId: string, ids: string[], reason: string | null) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('Debes incluir al menos un id.');
    }
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const result = await tx.alertInstance.updateMany({
        where: {
          id: { in: ids },
          companyId,
          status: { notIn: ['RESOLVED', 'DISMISSED'] },
        },
        data: {
          status: 'RESOLVED',
          resolvedBy: userId,
          resolvedAt: new Date(),
          resolvedReason: reason ?? null,
        },
      });
      return { updated: result.count };
    });
  }

  /* Used by the sidebar badge — defaults to ACTIVE+CRITICAL+BLOCKING so
     the count stays meaningful (everyday WARNINGs would drown the
     signal). Callers can pass a specific severity to override. */
  async getActiveCount(companyId: string, severity?: AlertSeverity) {
    const where: Prisma.AlertInstanceWhereInput = { companyId, status: 'ACTIVE' };
    if (severity) {
      where.severity = severity;
    } else {
      where.severity = { in: ['CRITICAL', 'BLOCKING'] };
    }
    const count = await this.prisma.alertInstance.count({ where });
    return { count };
  }
}
