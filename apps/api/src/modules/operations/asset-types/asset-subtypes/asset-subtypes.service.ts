import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RlsService } from '../../../common/rls/rls.service';
import { CreateAssetSubtypeDto } from './dto/create-asset-subtype.dto';
import { FilterAssetSubtypesDto } from './dto/filter-asset-subtypes.dto';
import { UpdateAssetSubtypeDto } from './dto/update-asset-subtype.dto';

@Injectable()
export class AssetSubtypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  /* Subtypes don't carry their own companyId column — they belong to an
     AssetType which does. So tenant scoping always goes through the parent. */
  private async assertParentInCompany(assetTypeId: string, companyId: string) {
    const parent = await this.prisma.assetType.findFirst({
      where: { id: assetTypeId, companyId },
      select: { id: true },
    });
    if (!parent) {
      throw new BadRequestException('El tipo de activo no existe en esta empresa.');
    }
  }

  async findAll(companyId: string, filters: FilterAssetSubtypesDto) {
    const where: Prisma.AssetSubtypeWhereInput = {
      assetType: { companyId },
      isActive: filters.isActive ?? true,
    };
    if (filters.assetTypeId) where.assetTypeId = filters.assetTypeId;

    return this.prisma.assetSubtype.findMany({
      where,
      include: { assetType: { select: { id: true, name: true, category: true } } },
      orderBy: [{ assetType: { name: 'asc' } }, { name: 'asc' }],
    });
  }

  async findOne(id: string, companyId: string) {
    const subtype = await this.prisma.assetSubtype.findFirst({
      where: { id, assetType: { companyId } },
      include: { assetType: true },
    });
    if (!subtype) throw new NotFoundException('Subtipo no encontrado');
    return subtype;
  }

  async create(companyId: string, userId: string, dto: CreateAssetSubtypeDto) {
    await this.assertParentInCompany(dto.assetTypeId, companyId);
    try {
      return await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.assetSubtype.create({
          data: {
            assetTypeId: dto.assetTypeId,
            name: dto.name,
            specifications:
              (dto.specifications as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
            ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          },
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException(
          'Ya existe un subtipo con ese nombre dentro del tipo seleccionado.',
        );
      }
      throw err;
    }
  }

  async update(id: string, companyId: string, userId: string, dto: UpdateAssetSubtypeDto) {
    await this.findOne(id, companyId);
    if (dto.assetTypeId) await this.assertParentInCompany(dto.assetTypeId, companyId);
    try {
      return await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.assetSubtype.update({
          where: { id },
          data: {
            ...(dto.assetTypeId !== undefined ? { assetTypeId: dto.assetTypeId } : {}),
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.specifications !== undefined
              ? { specifications: dto.specifications as Prisma.InputJsonValue }
              : {}),
            ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          },
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException('Ya existe un subtipo con ese nombre.');
      }
      throw err;
    }
  }

  async remove(id: string, companyId: string, userId: string) {
    await this.findOne(id, companyId);
    const usage = await this.prisma.operationalAsset.count({
      where: { assetSubtypeId: id, companyId },
    });
    /* Preserve referential context if any asset still uses this subtype. */
    if (usage > 0) {
      return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.assetSubtype.update({ where: { id }, data: { isActive: false } });
      });
    }
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.assetSubtype.delete({ where: { id } });
    });
  }
}
