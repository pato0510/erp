import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AbsenceCategory, AbsenceDayUnit, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { CreateAbsenceTypeDto } from './dto/create-absence-type.dto';
import { UpdateAbsenceTypeDto } from './dto/update-absence-type.dto';

interface SeedType {
  name: string;
  category: AbsenceCategory;
  daysDefault: number | null;
  unit: AbsenceDayUnit;
  withPay: boolean;
  isLegal: boolean;
}

/* The Chilean legal permit set (owner-validated). Seeded idempotently via
   createMany + skipDuplicates keyed on (companyId, name). */
const RECOMMENDED_TYPES: SeedType[] = [
  {
    name: 'Matrimonio / AUC',
    category: 'PERMISO',
    daysDefault: 5,
    unit: 'HABILES',
    withPay: true,
    isLegal: true,
  },
  {
    name: 'Nacimiento (permiso paternal)',
    category: 'PERMISO',
    daysDefault: 5,
    unit: 'HABILES',
    withPay: true,
    isLegal: true,
  },
  {
    name: 'Fallecimiento de hijo',
    category: 'PERMISO',
    daysDefault: 10,
    unit: 'CORRIDOS',
    withPay: true,
    isLegal: true,
  },
  {
    name: 'Fallecimiento de cónyuge o conviviente civil',
    category: 'PERMISO',
    daysDefault: 7,
    unit: 'CORRIDOS',
    withPay: true,
    isLegal: true,
  },
  {
    name: 'Fallecimiento de hijo en gestación',
    category: 'PERMISO',
    daysDefault: 7,
    unit: 'HABILES',
    withPay: true,
    isLegal: true,
  },
  {
    name: 'Fallecimiento de padre, madre o hermano',
    category: 'PERMISO',
    daysDefault: 4,
    unit: 'HABILES',
    withPay: true,
    isLegal: true,
  },
  {
    name: 'Exámenes médicos preventivos',
    category: 'PERMISO',
    daysDefault: 0,
    unit: 'MEDIO_DIA',
    withPay: true,
    isLegal: true,
  },
  {
    name: 'Permiso administrativo sin goce',
    category: 'PERMISO',
    daysDefault: null,
    unit: 'HABILES',
    withPay: false,
    isLegal: false,
  },
];

@Injectable()
export class AbsenceTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  findAll(companyId: string, filters: { activeOnly?: boolean; category?: AbsenceCategory } = {}) {
    return this.prisma.absenceType.findMany({
      where: {
        companyId,
        ...(filters.activeOnly ? { active: true } : {}),
        ...(filters.category ? { category: filters.category } : {}),
      },
      orderBy: [{ active: 'desc' }, { category: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string, companyId: string) {
    const type = await this.prisma.absenceType.findFirst({ where: { id, companyId } });
    if (!type) throw new NotFoundException('Tipo de ausencia no encontrado');
    return type;
  }

  async create(companyId: string, userId: string, dto: CreateAbsenceTypeDto) {
    try {
      return await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.absenceType.create({
          data: {
            companyId,
            createdBy: userId,
            name: dto.name,
            category: dto.category ?? 'PERMISO',
            daysDefault: dto.daysDefault ?? null,
            unit: dto.unit ?? 'HABILES',
            withPay: dto.withPay ?? true,
            isLegal: dto.isLegal ?? false,
          },
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException(
          'Ya existe un tipo de ausencia con ese nombre en la empresa.',
        );
      }
      throw err;
    }
  }

  async update(id: string, companyId: string, userId: string, dto: UpdateAbsenceTypeDto) {
    await this.findOne(id, companyId);
    const data: Prisma.AbsenceTypeUncheckedUpdateInput = { updatedBy: userId };
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.daysDefault !== undefined) data.daysDefault = dto.daysDefault;
    if (dto.unit !== undefined) data.unit = dto.unit;
    if (dto.withPay !== undefined) data.withPay = dto.withPay;
    if (dto.isLegal !== undefined) data.isLegal = dto.isLegal;
    if (dto.active !== undefined) data.active = dto.active;
    try {
      return await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.absenceType.update({ where: { id }, data });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException(
          'Ya existe un tipo de ausencia con ese nombre en la empresa.',
        );
      }
      throw err;
    }
  }

  /** Soft-disable — never hard-delete (absences reference it via onDelete: SetNull). */
  async deactivate(id: string, companyId: string, userId: string) {
    await this.findOne(id, companyId);
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.absenceType.update({ where: { id }, data: { active: false, updatedBy: userId } });
    });
  }

  /** Seed the recommended Chilean legal permit types. Idempotent. */
  async seedRecommended(companyId: string, userId: string) {
    const data = RECOMMENDED_TYPES.map((t) => ({
      companyId,
      createdBy: userId,
      name: t.name,
      category: t.category,
      daysDefault: t.daysDefault,
      unit: t.unit,
      withPay: t.withPay,
      isLegal: t.isLegal,
    }));
    const result = await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.absenceType.createMany({ data, skipDuplicates: true });
    });
    return {
      created: result.count,
      alreadyPresent: RECOMMENDED_TYPES.length - result.count,
      total: RECOMMENDED_TYPES.length,
      types: await this.findAll(companyId),
    };
  }
}
