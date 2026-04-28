import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { CreateAssetTypeDto } from './dto/create-asset-type.dto';
import { UpdateAssetTypeDto } from './dto/update-asset-type.dto';

@Injectable()
export class AssetTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  async findAll(companyId: string) {
    return this.prisma.assetType.findMany({
      where: { companyId, isActive: true },
      include: { subtypes: { where: { isActive: true }, orderBy: { name: 'asc' } } },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string, companyId: string) {
    const t = await this.prisma.assetType.findFirst({
      where: { id, companyId },
      include: { subtypes: { orderBy: { name: 'asc' } } },
    });
    if (!t) throw new NotFoundException('Tipo de activo no encontrado');
    return t;
  }

  async create(companyId: string, userId: string, dto: CreateAssetTypeDto) {
    try {
      return await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.assetType.create({ data: { ...dto, companyId } });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException(
          'Ya existe un tipo de activo con ese nombre en esta empresa.',
        );
      }
      throw err;
    }
  }

  async update(id: string, companyId: string, userId: string, dto: UpdateAssetTypeDto) {
    await this.findOne(id, companyId);
    try {
      return await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.assetType.update({ where: { id }, data: dto });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException(
          'Ya existe un tipo de activo con ese nombre en esta empresa.',
        );
      }
      throw err;
    }
  }

  async remove(id: string, companyId: string, userId: string) {
    await this.findOne(id, companyId);
    const usage = await this.prisma.operationalAsset.count({
      where: { assetTypeId: id, companyId },
    });
    /* Soft-delete when in use to preserve referential context. Hard delete if
       no asset still points to it. */
    if (usage > 0) {
      return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.assetType.update({ where: { id }, data: { isActive: false } });
      });
    }
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.assetType.delete({ where: { id } });
    });
  }
}
