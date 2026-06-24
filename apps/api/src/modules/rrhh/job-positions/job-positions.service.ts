import { Injectable, NotFoundException } from '@nestjs/common';
import { AreaRRHH, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { CreateJobPositionDto } from './dto/create-job-position.dto';
import { UpdateJobPositionDto } from './dto/update-job-position.dto';

interface ListFilters {
  area?: AreaRRHH;
  active?: boolean;
}

@Injectable()
export class JobPositionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  async findAll(companyId: string, filters: ListFilters = {}) {
    const where: Prisma.JobPositionWhereInput = { companyId };
    if (filters.area) where.area = filters.area;
    if (filters.active !== undefined) where.active = filters.active;
    return this.prisma.jobPosition.findMany({
      where,
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string, companyId: string) {
    const position = await this.prisma.jobPosition.findFirst({ where: { id, companyId } });
    if (!position) throw new NotFoundException('Cargo no encontrado');
    return position;
  }

  async create(companyId: string, userId: string, dto: CreateJobPositionDto) {
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.jobPosition.create({
        data: {
          companyId,
          createdBy: userId,
          name: dto.name,
          area: dto.area,
          description: dto.description ?? null,
          requiredCertTypes: dto.requiredCertTypes ?? [],
          requiredDocTypes: dto.requiredDocTypes ?? [],
          enabledServices: dto.enabledServices ?? [],
          active: dto.active ?? true,
        },
      });
    });
  }

  async update(id: string, companyId: string, userId: string, dto: UpdateJobPositionDto) {
    await this.findOne(id, companyId);
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.jobPosition.update({
        where: { id },
        data: { ...dto, updatedBy: userId },
      });
    });
  }

  /** Soft-deactivate (active=false). Cargos are referenced by employees from
   * HR-003 onward, so V1 never hard-deletes a job position. */
  async deactivate(id: string, companyId: string, userId: string) {
    await this.findOne(id, companyId);
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.jobPosition.update({
        where: { id },
        data: { active: false, updatedBy: userId },
      });
    });
  }
}
