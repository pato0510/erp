import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { RlsService } from '../common/rls/rls.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { FilterCategoryDto } from './dto/filter-category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  async findAll(companyId: string, filters: FilterCategoryDto) {
    const where: Prisma.CategoryWhereInput = {
      companyId,
      isActive: filters.isActive ?? true,
    };

    if (filters.type) {
      where.type = filters.type;
    }

    if (filters.search) {
      where.name = { contains: filters.search, mode: 'insensitive' };
    }

    return this.prisma.category.findMany({
      where,
      include: { children: true },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string, companyId: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, companyId },
      include: { children: true, parent: true },
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async create(companyId: string, userId: string, dto: CreateCategoryDto) {
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.category.create({
        data: { ...dto, companyId },
      });
    });
  }

  async update(id: string, companyId: string, userId: string, dto: UpdateCategoryDto) {
    await this.findOne(id, companyId);

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.category.update({
        where: { id },
        data: dto,
      });
    });
  }

  async deactivate(id: string, companyId: string, userId: string) {
    await this.findOne(id, companyId);

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.category.update({
        where: { id },
        data: { isActive: false },
      });
    });
  }
}
