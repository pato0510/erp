import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ServiceCategory } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

/**
 * The B2B drone / industrial service catalogue. Each entry has a category, a
 * billing unit and a base price; the requires* flags feed the opportunity /
 * quote builders. DELETE soft-deletes by default (active=false) so existing
 * opportunities/quotes that reference a service by id keep resolving.
 */
@Injectable()
export class ServiceCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  private serialize(s: {
    id: string;
    name: string;
    category: ServiceCategory;
    description: string | null;
    billingUnit: string;
    basePrice: Prisma.Decimal;
    requiresEquipment: boolean;
    requiresCertifiedStaff: boolean;
    active: boolean;
  }) {
    return {
      id: s.id,
      name: s.name,
      category: s.category,
      description: s.description,
      billingUnit: s.billingUnit,
      basePrice: Number(s.basePrice),
      requiresEquipment: s.requiresEquipment,
      requiresCertifiedStaff: s.requiresCertifiedStaff,
      active: s.active,
    };
  }

  /** List services, optionally filtered by category. Ordered by category, name. */
  async findAll(companyId: string, category?: ServiceCategory) {
    const services = await this.prisma.serviceCatalog.findMany({
      where: { companyId, ...(category ? { category } : {}) },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    return services.map((s) => this.serialize(s));
  }

  async create(companyId: string, dto: CreateServiceDto) {
    const created = await this.prisma.serviceCatalog.create({
      data: {
        companyId,
        name: dto.name,
        category: dto.category,
        description: dto.description ?? null,
        billingUnit: dto.billingUnit,
        basePrice: new Prisma.Decimal(dto.basePrice),
        requiresEquipment: dto.requiresEquipment ?? false,
        requiresCertifiedStaff: dto.requiresCertifiedStaff ?? false,
        active: dto.active ?? true,
      },
    });
    return this.serialize(created);
  }

  async update(id: string, companyId: string, dto: UpdateServiceDto) {
    const existing = await this.prisma.serviceCatalog.findFirst({ where: { id, companyId } });
    if (!existing) throw new NotFoundException('Servicio no encontrado');

    const updated = await this.prisma.serviceCatalog.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        category: dto.category ?? undefined,
        description: dto.description ?? undefined,
        billingUnit: dto.billingUnit ?? undefined,
        basePrice: dto.basePrice !== undefined ? new Prisma.Decimal(dto.basePrice) : undefined,
        requiresEquipment: dto.requiresEquipment ?? undefined,
        requiresCertifiedStaff: dto.requiresCertifiedStaff ?? undefined,
        active: dto.active ?? undefined,
      },
    });
    return this.serialize(updated);
  }

  /** Soft-delete (active=false) so historical references keep resolving. */
  async remove(id: string, companyId: string) {
    const existing = await this.prisma.serviceCatalog.findFirst({ where: { id, companyId } });
    if (!existing) throw new NotFoundException('Servicio no encontrado');
    const updated = await this.prisma.serviceCatalog.update({
      where: { id },
      data: { active: false },
    });
    return { id: updated.id, active: updated.active, deactivated: true };
  }
}
