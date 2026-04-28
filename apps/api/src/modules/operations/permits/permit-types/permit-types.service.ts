import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RlsService } from '../../../common/rls/rls.service';
import { DEFAULT_PERMIT_TYPES_CHILE, PermitTypeSeed } from '../permit-types.constants';
import { CreatePermitTypeDto } from './dto/create-permit-type.dto';
import { UpdatePermitTypeDto } from './dto/update-permit-type.dto';

@Injectable()
export class PermitTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  async findAll(companyId: string) {
    return this.prisma.permitType.findMany({
      where: { companyId },
      orderBy: [{ isActive: 'desc' }, { category: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string, companyId: string) {
    const row = await this.prisma.permitType.findFirst({ where: { id, companyId } });
    if (!row) throw new NotFoundException('Tipo de permiso no encontrado.');
    return row;
  }

  async create(companyId: string, userId: string, dto: CreatePermitTypeDto) {
    try {
      return await this.rlsService.executeWithRls(companyId, userId, async (tx) =>
        tx.permitType.create({
          data: {
            companyId,
            name: dto.name.trim(),
            code: dto.code.trim().toUpperCase(),
            category: dto.category,
            issuingAuthority: dto.issuingAuthority?.trim() ?? null,
            hasExpiration: dto.hasExpiration ?? true,
            defaultValidityDays: dto.defaultValidityDays ?? null,
            alertDaysBefore: dto.alertDaysBefore ?? 30,
            criticalAlertDaysBefore: dto.criticalAlertDaysBefore ?? 7,
            criticality: dto.criticality,
            blocksOperation: dto.blocksOperation ?? false,
            description: dto.description?.trim() ?? null,
            icon: dto.icon?.trim() ?? null,
            color: dto.color?.trim() ?? null,
            createdBy: userId,
          },
        }),
      );
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Ya existe un tipo de permiso con ese código o nombre.');
      }
      throw err;
    }
  }

  async update(id: string, companyId: string, userId: string, dto: UpdatePermitTypeDto) {
    await this.findOne(id, companyId);
    try {
      return await this.rlsService.executeWithRls(companyId, userId, async (tx) =>
        tx.permitType.update({
          where: { id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
            ...(dto.code !== undefined ? { code: dto.code.trim().toUpperCase() } : {}),
            ...(dto.category !== undefined ? { category: dto.category } : {}),
            ...(dto.issuingAuthority !== undefined
              ? { issuingAuthority: dto.issuingAuthority?.trim() ?? null }
              : {}),
            ...(dto.hasExpiration !== undefined ? { hasExpiration: dto.hasExpiration } : {}),
            ...(dto.defaultValidityDays !== undefined
              ? { defaultValidityDays: dto.defaultValidityDays }
              : {}),
            ...(dto.alertDaysBefore !== undefined ? { alertDaysBefore: dto.alertDaysBefore } : {}),
            ...(dto.criticalAlertDaysBefore !== undefined
              ? { criticalAlertDaysBefore: dto.criticalAlertDaysBefore }
              : {}),
            ...(dto.criticality !== undefined ? { criticality: dto.criticality } : {}),
            ...(dto.blocksOperation !== undefined ? { blocksOperation: dto.blocksOperation } : {}),
            ...(dto.description !== undefined
              ? { description: dto.description?.trim() ?? null }
              : {}),
            ...(dto.icon !== undefined ? { icon: dto.icon?.trim() ?? null } : {}),
            ...(dto.color !== undefined ? { color: dto.color?.trim() ?? null } : {}),
          },
        }),
      );
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Ya existe un tipo de permiso con ese código o nombre.');
      }
      throw err;
    }
  }

  /* Soft-delete via isActive=false. We never hard-delete because
     existing Permit rows would lose their FK target. */
  async remove(id: string, companyId: string, userId: string) {
    await this.findOne(id, companyId);
    const usage = await this.prisma.permit.count({
      where: { permitTypeId: id, isActive: true },
    });
    if (usage > 0) {
      throw new BadRequestException(
        'Existen permisos activos vinculados a este tipo. Archívalos antes de desactivar.',
      );
    }
    return this.rlsService.executeWithRls(companyId, userId, async (tx) =>
      tx.permitType.update({ where: { id }, data: { isActive: false } }),
    );
  }

  /* Idempotent seed. Skips entries whose code already exists in the
     company so repeated clicks are safe. */
  async seedDefaults(companyId: string, userId: string) {
    const existing = await this.prisma.permitType.findMany({
      where: { companyId, code: { in: DEFAULT_PERMIT_TYPES_CHILE.map((s) => s.code) } },
      select: { code: true },
    });
    const existingCodes = new Set(existing.map((e) => e.code));
    const toInsert = DEFAULT_PERMIT_TYPES_CHILE.filter((s) => !existingCodes.has(s.code));
    if (toInsert.length === 0) {
      return { created: 0, skipped: existingCodes.size };
    }
    await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      await tx.permitType.createMany({
        data: toInsert.map((s) => this.toCreateData(companyId, userId, s)),
        skipDuplicates: true,
      });
    });
    return { created: toInsert.length, skipped: existingCodes.size };
  }

  private toCreateData(companyId: string, userId: string, seed: PermitTypeSeed) {
    return {
      companyId,
      name: seed.name,
      code: seed.code,
      category: seed.category,
      issuingAuthority: seed.issuingAuthority,
      hasExpiration: seed.hasExpiration,
      defaultValidityDays: seed.defaultValidityDays,
      alertDaysBefore: seed.alertDaysBefore,
      criticalAlertDaysBefore: 7,
      criticality: seed.criticality,
      blocksOperation: seed.blocksOperation,
      icon: seed.icon,
      color: seed.color,
      isActive: true,
      createdBy: userId,
    };
  }
}
