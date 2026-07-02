import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ServiceCategory } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { CreateServiceCatalogDto } from './dto/create-service-catalog.dto';
import { UpdateServiceCatalogDto } from './dto/update-service-catalog.dto';

interface ListFilters {
  category?: ServiceCategory;
  active?: boolean;
}

@Injectable()
export class ServiceCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  async findAll(companyId: string, filters: ListFilters = {}) {
    const where: Prisma.ServiceCatalogWhereInput = { companyId };
    if (filters.category) where.category = filters.category;
    if (filters.active !== undefined) where.isActive = filters.active;
    return this.prisma.serviceCatalog.findMany({
      where,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string, companyId: string) {
    const service = await this.prisma.serviceCatalog.findFirst({ where: { id, companyId } });
    if (!service) throw new NotFoundException('Servicio no encontrado');
    return service;
  }

  async create(companyId: string, userId: string, dto: CreateServiceCatalogDto) {
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.serviceCatalog.create({
        data: {
          companyId,
          createdBy: userId,
          name: dto.name,
          description: dto.description ?? null,
          code: dto.code ?? null,
          category: dto.category,
          unit: dto.unit,
          basePrice: new Prisma.Decimal(dto.basePrice),
          isActive: dto.isActive ?? true,
        },
      });
    });
  }

  async update(id: string, companyId: string, userId: string, dto: UpdateServiceCatalogDto) {
    await this.findOne(id, companyId);
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const data: Prisma.ServiceCatalogUpdateInput = { ...dto };
      if (dto.basePrice !== undefined) data.basePrice = new Prisma.Decimal(dto.basePrice);
      return tx.serviceCatalog.update({ where: { id }, data });
    });
  }

  /** Soft-deactivate (isActive=false). service_catalog is referenced by
   * opportunity_services / quote_lines in later COM tickets, so V1 never
   * hard-deletes a catalog entry — the DELETE endpoint deactivates instead. */
  async deactivate(id: string, companyId: string, userId: string) {
    await this.findOne(id, companyId);
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.serviceCatalog.update({ where: { id }, data: { isActive: false } });
    });
  }
}
