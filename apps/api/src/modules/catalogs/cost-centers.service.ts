import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { RlsService } from '../common/rls/rls.service';
import { CreateCostCenterDto } from './dto/create-cost-center.dto';
import { UpdateCostCenterDto } from './dto/update-cost-center.dto';

@Injectable()
export class CostCentersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  async findAll(companyId: string, search?: string, isActive = true) {
    return this.prisma.costCenter.findMany({
      where: {
        companyId,
        isActive,
        ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const costCenter = await this.prisma.costCenter.findFirst({
      where: { id, companyId },
    });
    if (!costCenter) throw new NotFoundException('Cost center not found');
    return costCenter;
  }

  async create(companyId: string, userId: string, dto: CreateCostCenterDto) {
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.costCenter.create({ data: { ...dto, companyId } });
    });
  }

  async update(id: string, companyId: string, userId: string, dto: UpdateCostCenterDto) {
    await this.findOne(id, companyId);
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.costCenter.update({ where: { id }, data: dto });
    });
  }

  async deactivate(id: string, companyId: string, userId: string) {
    await this.findOne(id, companyId);
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.costCenter.update({ where: { id }, data: { isActive: false } });
    });
  }
}
