import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
    try {
      return await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.category.create({
          data: { ...dto, companyId },
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException(
          'Ya existe una categoría con ese nombre y tipo en esta empresa.',
        );
      }
      throw err;
    }
  }

  async update(id: string, companyId: string, userId: string, dto: UpdateCategoryDto) {
    await this.findOne(id, companyId);

    try {
      return await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.category.update({
          where: { id },
          data: dto,
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException(
          'Ya existe una categoría con ese nombre y tipo en esta empresa.',
        );
      }
      throw err;
    }
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

  async hardDelete(id: string, companyId: string, userId: string) {
    await this.findOne(id, companyId);

    const [movementCount, commitmentCount, childCount] = await Promise.all([
      this.prisma.movement.count({ where: { categoryId: id, companyId } }),
      this.prisma.commitment.count({ where: { categoryId: id, companyId } }),
      this.prisma.category.count({ where: { parentId: id, companyId } }),
    ]);

    const blockers: string[] = [];
    if (movementCount > 0) {
      blockers.push(`${movementCount} movimiento${movementCount === 1 ? '' : 's'}`);
    }
    if (commitmentCount > 0) {
      blockers.push(`${commitmentCount} compromiso${commitmentCount === 1 ? '' : 's'}`);
    }
    if (childCount > 0) {
      blockers.push(`${childCount} subcategoría${childCount === 1 ? '' : 's'}`);
    }

    if (blockers.length > 0) {
      throw new BadRequestException(
        `No se puede eliminar: la categoría tiene ${blockers.join(', ')} asociada${
          blockers.length === 1 ? '' : 's'
        }. Desactívala en su lugar.`,
      );
    }

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.category.delete({ where: { id } });
    });
  }
}
