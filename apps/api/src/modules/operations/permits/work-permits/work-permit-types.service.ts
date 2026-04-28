import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RlsService } from '../../../common/rls/rls.service';
import { CreateWorkPermitTypeDto } from './dto/create-work-permit-type.dto';
import { UpdateWorkPermitTypeDto } from './dto/update-work-permit-type.dto';
import { DEFAULT_WORK_PERMIT_TYPES, DefaultWorkPermitType } from './work-permit-types.constants';

@Injectable()
export class WorkPermitTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  findAll(companyId: string) {
    return this.prisma.workPermitType.findMany({
      where: { companyId },
      orderBy: [{ isActive: 'desc' }, { category: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string, companyId: string) {
    const row = await this.prisma.workPermitType.findFirst({ where: { id, companyId } });
    if (!row) throw new NotFoundException('Tipo de permiso de trabajo no encontrado.');
    return row;
  }

  async create(companyId: string, userId: string, dto: CreateWorkPermitTypeDto) {
    try {
      return await this.rlsService.executeWithRls(companyId, userId, (tx) =>
        tx.workPermitType.create({
          data: this.toCreateData(companyId, userId, {
            ...dto,
            code: dto.code.trim().toUpperCase(),
            name: dto.name.trim(),
          }),
        }),
      );
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(
          'Ya existe un tipo de permiso de trabajo con ese código o nombre.',
        );
      }
      throw err;
    }
  }

  async update(id: string, companyId: string, userId: string, dto: UpdateWorkPermitTypeDto) {
    await this.findOne(id, companyId);
    try {
      return await this.rlsService.executeWithRls(companyId, userId, (tx) =>
        tx.workPermitType.update({
          where: { id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
            ...(dto.code !== undefined ? { code: dto.code.trim().toUpperCase() } : {}),
            ...(dto.category !== undefined ? { category: dto.category } : {}),
            ...(dto.description !== undefined
              ? { description: dto.description?.trim() ?? null }
              : {}),
            ...(dto.maxDurationHours !== undefined
              ? { maxDurationHours: dto.maxDurationHours }
              : {}),
            ...(dto.requiredRoles !== undefined ? { requiredRoles: dto.requiredRoles } : {}),
            ...(dto.requiresMedicalAptitude !== undefined
              ? { requiresMedicalAptitude: dto.requiresMedicalAptitude }
              : {}),
            ...(dto.requiresSpecificTraining !== undefined
              ? { requiresSpecificTraining: dto.requiresSpecificTraining }
              : {}),
            ...(dto.requiresGasMeasurement !== undefined
              ? { requiresGasMeasurement: dto.requiresGasMeasurement }
              : {}),
            ...(dto.requiresIsolation !== undefined
              ? { requiresIsolation: dto.requiresIsolation }
              : {}),
            ...(dto.defaultRisks !== undefined ? { defaultRisks: dto.defaultRisks } : {}),
            ...(dto.defaultControls !== undefined ? { defaultControls: dto.defaultControls } : {}),
            ...(dto.icon !== undefined ? { icon: dto.icon?.trim() ?? null } : {}),
            ...(dto.color !== undefined ? { color: dto.color?.trim() ?? null } : {}),
            ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          },
        }),
      );
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(
          'Ya existe un tipo de permiso de trabajo con ese código o nombre.',
        );
      }
      throw err;
    }
  }

  async remove(id: string, companyId: string, userId: string) {
    await this.findOne(id, companyId);
    /* Hard-blocked when there are active work permits referencing this
       type. Closed/cancelled/expired permits keep the FK so users
       always see "deactivate" instead. */
    const active = await this.prisma.workPermit.count({
      where: {
        permitTypeId: id,
        companyId,
        status: {
          in: ['DRAFT', 'PENDING_AUTHORIZATION', 'AUTHORIZED', 'IN_EXECUTION', 'SUSPENDED'],
        },
      },
    });
    if (active > 0) {
      throw new BadRequestException(
        'Existen permisos de trabajo activos vinculados a este tipo. Ciérralos o cancélalos antes de desactivar.',
      );
    }
    return this.rlsService.executeWithRls(companyId, userId, (tx) =>
      tx.workPermitType.update({ where: { id }, data: { isActive: false } }),
    );
  }

  /* Idempotent — skips entries whose code already exists in the
     company. Returns counts so the UI can show "X creados, Y omitidos". */
  async seedDefaults(companyId: string, userId: string) {
    const existing = await this.prisma.workPermitType.findMany({
      where: { companyId, code: { in: DEFAULT_WORK_PERMIT_TYPES.map((s) => s.code) } },
      select: { code: true },
    });
    const existingCodes = new Set(existing.map((e) => e.code));
    const toInsert = DEFAULT_WORK_PERMIT_TYPES.filter((s) => !existingCodes.has(s.code));
    if (toInsert.length === 0) {
      return { createdCount: 0, skippedCount: existingCodes.size };
    }
    await this.rlsService.executeWithRls(companyId, userId, (tx) =>
      tx.workPermitType.createMany({
        data: toInsert.map((s) => this.toCreateData(companyId, userId, s)),
        skipDuplicates: true,
      }),
    );
    return { createdCount: toInsert.length, skippedCount: existingCodes.size };
  }

  private toCreateData(
    companyId: string,
    userId: string,
    seed: DefaultWorkPermitType | (CreateWorkPermitTypeDto & { code: string; name: string }),
  ) {
    return {
      companyId,
      name: seed.name,
      code: seed.code,
      category: seed.category,
      description: seed.description ?? null,
      maxDurationHours: seed.maxDurationHours ?? 8,
      requiredRoles: seed.requiredRoles ?? [],
      requiresMedicalAptitude: seed.requiresMedicalAptitude ?? false,
      requiresSpecificTraining: seed.requiresSpecificTraining ?? false,
      requiresGasMeasurement: seed.requiresGasMeasurement ?? false,
      requiresIsolation: seed.requiresIsolation ?? false,
      defaultRisks: seed.defaultRisks ?? [],
      defaultControls: seed.defaultControls ?? [],
      icon: seed.icon ?? null,
      color: seed.color ?? null,
      isActive: 'isActive' in seed && seed.isActive !== undefined ? seed.isActive : true,
      createdBy: userId,
    };
  }
}
