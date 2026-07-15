import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { CreateAreaDto } from './dto/create-area.dto';
import { UpdateAreaDto } from './dto/update-area.dto';

interface ListFilters {
  active?: boolean;
}

@Injectable()
export class AreasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  async findAll(companyId: string, filters: ListFilters = {}) {
    const where: Prisma.ActivityAreaWhereInput = { companyId };
    if (filters.active !== undefined) where.active = filters.active;
    return this.prisma.activityArea.findMany({ where, orderBy: [{ name: 'asc' }] });
  }

  private async getAreaOrThrow(id: string, companyId: string) {
    const area = await this.prisma.activityArea.findFirst({ where: { id, companyId } });
    if (!area) throw new NotFoundException('Área no encontrada');
    return area;
  }

  async create(companyId: string, userId: string, dto: CreateAreaDto) {
    try {
      return await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.activityArea.create({
          data: {
            companyId,
            createdBy: userId,
            name: dto.name.trim(),
            color: dto.color ?? null,
          },
        });
      });
    } catch (e) {
      // Platform P2002→409 convention: the (companyId, name) UNIQUE rejects a duplicate
      // name; surface it as a clean Spanish conflict rather than a 500.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un área con ese nombre.');
      }
      throw e;
    }
  }

  async update(id: string, companyId: string, userId: string, dto: UpdateAreaDto) {
    await this.getAreaOrThrow(id, companyId);
    const data: Prisma.ActivityAreaUncheckedUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.color !== undefined) data.color = dto.color ?? null;
    if (dto.active !== undefined) data.active = dto.active;
    try {
      return await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.activityArea.update({ where: { id }, data });
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un área con ese nombre.');
      }
      throw e;
    }
  }

  async remove(id: string, companyId: string, userId: string) {
    await this.getAreaOrThrow(id, companyId);
    // CAL-002 — the "zero activities" pristine-delete guard cannot exist yet:
    // calendar_activities arrives in CAL-003, which adds BOTH the count pre-check AND the
    // DB `Restrict` FK (areaId → activity_areas) and proves the 409 there. For now a delete
    // always succeeds (no activities can reference an area). This is deliberate, not a gap.
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.activityArea.delete({ where: { id } });
    });
  }
}
