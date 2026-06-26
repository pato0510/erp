import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CertificationCategory, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { CreateCertificationTypeDto } from './dto/create-certification-type.dto';
import { UpdateCertificationTypeDto } from './dto/update-certification-type.dto';

interface SeedType {
  name: string;
  category: CertificationCategory;
  requiresExpiry: boolean;
  defaultValidityDays: number | null;
}

/* A sensible, GENERIC starter set of mining/operational certifications (editable;
   NOT client-specific). Seeded idempotently via createMany + skipDuplicates keyed
   on the (companyId, name) unique index — mirrors the HR-004 doc-type seed. */
const RECOMMENDED_TYPES: SeedType[] = [
  {
    name: 'Licencia de conducir',
    category: 'CERTIFICACION',
    requiresExpiry: true,
    defaultValidityDays: null,
  },
  {
    name: 'Manejo a la defensiva',
    category: 'CERTIFICACION',
    requiresExpiry: true,
    defaultValidityDays: 365,
  },
  {
    name: 'Trabajo en altura',
    category: 'CERTIFICACION',
    requiresExpiry: true,
    defaultValidityDays: 365,
  },
  {
    name: 'Trabajo en espacios confinados',
    category: 'CERTIFICACION',
    requiresExpiry: true,
    defaultValidityDays: 365,
  },
  {
    name: 'Uso de EPP',
    category: 'CERTIFICACION',
    requiresExpiry: false,
    defaultValidityDays: null,
  },
  {
    name: 'Inducción de seguridad',
    category: 'CERTIFICACION',
    requiresExpiry: false,
    defaultValidityDays: null,
  },
  {
    name: 'Acreditación faena',
    category: 'HABILITACION_FAENA',
    requiresExpiry: true,
    defaultValidityDays: 365,
  },
];

@Injectable()
export class CertificationTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  findAll(
    companyId: string,
    filters: { activeOnly?: boolean; category?: CertificationCategory } = {},
  ) {
    return this.prisma.certificationType.findMany({
      where: {
        companyId,
        ...(filters.activeOnly ? { active: true } : {}),
        ...(filters.category ? { category: filters.category } : {}),
      },
      orderBy: [{ active: 'desc' }, { category: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string, companyId: string) {
    const type = await this.prisma.certificationType.findFirst({ where: { id, companyId } });
    if (!type) throw new NotFoundException('Tipo de certificación no encontrado');
    return type;
  }

  async create(companyId: string, userId: string, dto: CreateCertificationTypeDto) {
    try {
      return await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.certificationType.create({
          data: {
            companyId,
            createdBy: userId,
            name: dto.name,
            category: dto.category ?? 'CERTIFICACION',
            defaultValidityDays: dto.defaultValidityDays ?? null,
            requiresExpiry: dto.requiresExpiry ?? false,
            issuingEntity: dto.issuingEntity ?? null,
          },
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException(
          'Ya existe un tipo de certificación con ese nombre en la empresa.',
        );
      }
      throw err;
    }
  }

  async update(id: string, companyId: string, userId: string, dto: UpdateCertificationTypeDto) {
    await this.findOne(id, companyId);
    const data: Prisma.CertificationTypeUncheckedUpdateInput = { updatedBy: userId };
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.defaultValidityDays !== undefined) data.defaultValidityDays = dto.defaultValidityDays;
    if (dto.requiresExpiry !== undefined) data.requiresExpiry = dto.requiresExpiry;
    if (dto.issuingEntity !== undefined) data.issuingEntity = dto.issuingEntity || null;
    if (dto.active !== undefined) data.active = dto.active;
    try {
      return await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.certificationType.update({ where: { id }, data });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException(
          'Ya existe un tipo de certificación con ese nombre en la empresa.',
        );
      }
      throw err;
    }
  }

  /** Soft-disable — never hard-delete (certifications reference it via onDelete: Restrict). */
  async deactivate(id: string, companyId: string, userId: string) {
    await this.findOne(id, companyId);
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.certificationType.update({
        where: { id },
        data: { active: false, updatedBy: userId },
      });
    });
  }

  /** Seed the recommended starter certification types. Idempotent. */
  async seedRecommended(companyId: string, userId: string) {
    const data = RECOMMENDED_TYPES.map((t) => ({
      companyId,
      createdBy: userId,
      name: t.name,
      category: t.category,
      requiresExpiry: t.requiresExpiry,
      defaultValidityDays: t.defaultValidityDays,
    }));
    const result = await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.certificationType.createMany({ data, skipDuplicates: true });
    });
    return {
      created: result.count,
      alreadyPresent: RECOMMENDED_TYPES.length - result.count,
      total: RECOMMENDED_TYPES.length,
      types: await this.findAll(companyId),
    };
  }
}
