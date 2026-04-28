import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

@Injectable()
export class LocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  async findAll(companyId: string) {
    return this.prisma.location.findMany({
      where: { companyId, isActive: true },
      orderBy: [{ name: 'asc' }],
    });
  }

  async findOne(id: string, companyId: string) {
    const l = await this.prisma.location.findFirst({
      where: { id, companyId },
      include: { children: { orderBy: { name: 'asc' } } },
    });
    if (!l) throw new NotFoundException('Ubicación no encontrada');
    return l;
  }

  async create(companyId: string, userId: string, dto: CreateLocationDto) {
    try {
      return await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.location.create({
          data: {
            companyId,
            createdBy: userId,
            name: dto.name,
            code: dto.code ?? null,
            parentLocationId: dto.parentLocationId ?? null,
            address: dto.address ?? null,
            latitude: dto.latitude ?? null,
            longitude: dto.longitude ?? null,
          },
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException('Ya existe una ubicación con ese código.');
      }
      throw err;
    }
  }

  async update(id: string, companyId: string, userId: string, dto: UpdateLocationDto) {
    await this.findOne(id, companyId);
    try {
      return await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.location.update({ where: { id }, data: dto });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException('Ya existe una ubicación con ese código.');
      }
      throw err;
    }
  }

  async remove(id: string, companyId: string, userId: string) {
    await this.findOne(id, companyId);
    const usage = await this.prisma.operationalAsset.count({
      where: { locationId: id, companyId },
    });
    if (usage > 0) {
      return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.location.update({ where: { id }, data: { isActive: false } });
      });
    }
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.location.delete({ where: { id } });
    });
  }
}
