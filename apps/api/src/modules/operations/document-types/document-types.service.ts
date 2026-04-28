import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { DEFAULT_DOCUMENT_TYPES } from './document-types.constants';
import { CreateDocumentTypeDto } from './dto/create-document-type.dto';
import { FilterDocumentTypesDto } from './dto/filter-document-types.dto';
import { UpdateDocumentTypeDto } from './dto/update-document-type.dto';

@Injectable()
export class DocumentTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  async findAll(companyId: string, filters: FilterDocumentTypesDto) {
    const where: Prisma.OperationalDocumentTypeWhereInput = {
      companyId,
      isActive: filters.isActive ?? true,
    };
    if (filters.category) where.category = filters.category;
    if (filters.search) where.name = { contains: filters.search, mode: 'insensitive' };

    return this.prisma.operationalDocumentType.findMany({
      where,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string, companyId: string) {
    const docType = await this.prisma.operationalDocumentType.findFirst({
      where: { id, companyId },
    });
    if (!docType) throw new NotFoundException('Document type not found');
    return docType;
  }

  async create(companyId: string, userId: string, dto: CreateDocumentTypeDto) {
    try {
      return await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.operationalDocumentType.create({
          data: { ...dto, companyId, createdBy: userId },
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException(
          'Ya existe un tipo de documento con ese código o nombre en esta empresa.',
        );
      }
      throw err;
    }
  }

  async update(id: string, companyId: string, userId: string, dto: UpdateDocumentTypeDto) {
    await this.findOne(id, companyId);
    try {
      return await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.operationalDocumentType.update({
          where: { id },
          data: dto,
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException(
          'Ya existe un tipo de documento con ese código o nombre en esta empresa.',
        );
      }
      throw err;
    }
  }

  /* Soft-delete (isActive=false) by default. Hard delete only if no
     DocumentRequirement still references this type — otherwise the matrix
     would lose context. */
  async remove(id: string, companyId: string, userId: string) {
    await this.findOne(id, companyId);

    const requirementCount = await this.prisma.documentRequirement.count({
      where: { documentTypeId: id, companyId },
    });

    if (requirementCount > 0) {
      // soft-delete to preserve referential integrity in the requirements matrix
      return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.operationalDocumentType.update({
          where: { id },
          data: { isActive: false },
        });
      });
    }

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.operationalDocumentType.delete({ where: { id } });
    });
  }

  /* Idempotent seed of the default Chilean document catalog for a given
     company. Skips entries whose `code` already exists, so it can be re-run
     safely after the company has added its own custom types. */
  async seedDefaults(companyId: string, userId: string) {
    const created: Array<{ id: string; code: string; name: string }> = [];
    const skipped: string[] = [];

    for (const def of DEFAULT_DOCUMENT_TYPES) {
      const existing = await this.prisma.operationalDocumentType.findUnique({
        where: { companyId_code: { companyId, code: def.code } },
      });
      if (existing) {
        skipped.push(def.code);
        continue;
      }

      const dt = await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.operationalDocumentType.create({
          data: {
            companyId,
            createdBy: userId,
            code: def.code,
            name: def.name,
            category: def.category,
            criticality: def.criticality,
            blocksOperation: def.blocksOperation,
            hasExpiration: def.hasExpiration,
            defaultValidityDays: def.defaultValidityDays,
            ...(def.alertDaysBefore !== undefined ? { alertDaysBefore: def.alertDaysBefore } : {}),
            ...(def.criticalAlertDaysBefore !== undefined
              ? { criticalAlertDaysBefore: def.criticalAlertDaysBefore }
              : {}),
          },
        });
      });

      created.push({ id: dt.id, code: dt.code, name: dt.name });
    }

    return {
      createdCount: created.length,
      skippedCount: skipped.length,
      created,
      skipped,
    };
  }
}
