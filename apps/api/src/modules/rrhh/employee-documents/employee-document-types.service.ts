import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EmployeeDocCategory, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { CreateEmployeeDocumentTypeDto } from './dto/create-employee-document-type.dto';
import { UpdateEmployeeDocumentTypeDto } from './dto/update-employee-document-type.dto';

interface SeedType {
  name: string;
  category: EmployeeDocCategory;
  requiresExpiry: boolean;
  defaultValidityDays: number | null;
  isMandatoryDefault: boolean;
}

/* The recommended Chilean HR document-type set (PART1 §2.3). Seeded idempotently
   via createMany({ skipDuplicates: true }) keyed on the (companyId, name) unique
   index, so re-running only inserts the missing ones. */
const RECOMMENDED_TYPES: SeedType[] = [
  {
    name: 'Contrato de trabajo',
    category: 'CONTRATO',
    requiresExpiry: false,
    defaultValidityDays: null,
    isMandatoryDefault: true,
  },
  {
    name: 'Anexo de contrato',
    category: 'CONTRATO',
    requiresExpiry: false,
    defaultValidityDays: null,
    isMandatoryDefault: false,
  },
  {
    name: 'Cédula de identidad',
    category: 'IDENTIDAD',
    requiresExpiry: true,
    defaultValidityDays: null,
    isMandatoryDefault: true,
  },
  {
    name: 'Certificado AFP',
    category: 'PREVISIONAL',
    requiresExpiry: false,
    defaultValidityDays: null,
    isMandatoryDefault: true,
  },
  {
    name: 'Certificado de salud (Fonasa/Isapre)',
    category: 'SALUD',
    requiresExpiry: false,
    defaultValidityDays: null,
    isMandatoryDefault: true,
  },
  {
    name: 'Liquidación de sueldo',
    category: 'PREVISIONAL',
    requiresExpiry: false,
    defaultValidityDays: null,
    isMandatoryDefault: false,
  },
  {
    name: 'Carta de amonestación',
    category: 'AMONESTACION',
    requiresExpiry: false,
    defaultValidityDays: null,
    isMandatoryDefault: false,
  },
  {
    name: 'Finiquito',
    category: 'FINIQUITO',
    requiresExpiry: false,
    defaultValidityDays: null,
    isMandatoryDefault: false,
  },
  {
    name: 'Certificado de capacitación',
    category: 'CERTIFICACION',
    requiresExpiry: true,
    defaultValidityDays: null,
    isMandatoryDefault: false,
  },
  {
    name: 'Certificado piloto de drone',
    category: 'CERTIFICACION',
    requiresExpiry: true,
    defaultValidityDays: 730,
    isMandatoryDefault: false,
  },
  {
    name: 'Habilitación cliente',
    category: 'SEGURIDAD',
    requiresExpiry: true,
    defaultValidityDays: 365,
    isMandatoryDefault: false,
  },
  {
    name: 'Habilitación faena',
    category: 'SEGURIDAD',
    requiresExpiry: true,
    defaultValidityDays: 365,
    isMandatoryDefault: false,
  },
  {
    name: 'Examen ocupacional',
    category: 'SALUD',
    requiresExpiry: true,
    defaultValidityDays: 365,
    isMandatoryDefault: true,
  },
  {
    name: 'Entrega de EPP',
    category: 'SEGURIDAD',
    requiresExpiry: false,
    defaultValidityDays: null,
    isMandatoryDefault: false,
  },
  {
    name: 'Reglamento interno (acuse de recibo)',
    category: 'SEGURIDAD',
    requiresExpiry: false,
    defaultValidityDays: null,
    isMandatoryDefault: true,
  },
  {
    name: 'Obligación de informar (ODI)',
    category: 'SEGURIDAD',
    requiresExpiry: false,
    defaultValidityDays: null,
    isMandatoryDefault: true,
  },
  {
    name: 'Inducción de seguridad',
    category: 'SEGURIDAD',
    requiresExpiry: false,
    defaultValidityDays: null,
    isMandatoryDefault: false,
  },
];

@Injectable()
export class EmployeeDocumentTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  findAll(companyId: string, activeOnly = false) {
    return this.prisma.employeeDocumentType.findMany({
      where: { companyId, ...(activeOnly ? { active: true } : {}) },
      orderBy: [{ active: 'desc' }, { category: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string, companyId: string) {
    const type = await this.prisma.employeeDocumentType.findFirst({ where: { id, companyId } });
    if (!type) throw new NotFoundException('Tipo de documento no encontrado');
    return type;
  }

  async create(companyId: string, userId: string, dto: CreateEmployeeDocumentTypeDto) {
    try {
      return await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.employeeDocumentType.create({
          data: {
            companyId,
            createdBy: userId,
            name: dto.name,
            category: dto.category,
            defaultValidityDays: dto.defaultValidityDays ?? null,
            requiresExpiry: dto.requiresExpiry ?? false,
            isMandatoryDefault: dto.isMandatoryDefault ?? false,
          },
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException(
          'Ya existe un tipo de documento con ese nombre en la empresa.',
        );
      }
      throw err;
    }
  }

  async update(id: string, companyId: string, userId: string, dto: UpdateEmployeeDocumentTypeDto) {
    await this.findOne(id, companyId);
    const data: Prisma.EmployeeDocumentTypeUncheckedUpdateInput = { updatedBy: userId };
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.defaultValidityDays !== undefined) data.defaultValidityDays = dto.defaultValidityDays;
    if (dto.requiresExpiry !== undefined) data.requiresExpiry = dto.requiresExpiry;
    if (dto.isMandatoryDefault !== undefined) data.isMandatoryDefault = dto.isMandatoryDefault;
    if (dto.active !== undefined) data.active = dto.active;
    try {
      return await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.employeeDocumentType.update({ where: { id }, data });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException(
          'Ya existe un tipo de documento con ese nombre en la empresa.',
        );
      }
      throw err;
    }
  }

  /** Soft-disable — never hard-delete a type (document records reference it via
   * onDelete: Restrict). */
  async deactivate(id: string, companyId: string, userId: string) {
    await this.findOne(id, companyId);
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.employeeDocumentType.update({
        where: { id },
        data: { active: false, updatedBy: userId },
      });
    });
  }

  /** Seed the recommended Chilean HR document types for the company. Idempotent:
   * createMany + skipDuplicates only inserts the ones not already present. */
  async seedRecommended(companyId: string, userId: string) {
    const data = RECOMMENDED_TYPES.map((t) => ({
      companyId,
      createdBy: userId,
      name: t.name,
      category: t.category,
      requiresExpiry: t.requiresExpiry,
      defaultValidityDays: t.defaultValidityDays,
      isMandatoryDefault: t.isMandatoryDefault,
    }));
    const result = await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.employeeDocumentType.createMany({ data, skipDuplicates: true });
    });
    return {
      created: result.count,
      alreadyPresent: RECOMMENDED_TYPES.length - result.count,
      total: RECOMMENDED_TYPES.length,
      types: await this.findAll(companyId),
    };
  }
}
