import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  CreateServiceRequirementDto,
  UpdateServiceRequirementDto,
} from './dto/service-requirement.dto';

@Injectable()
export class ServiceRequirementsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string) {
    const rows = await this.prisma.serviceRequirement.findMany({
      where: { companyId },
      orderBy: { serviceName: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      serviceName: r.serviceName,
      requiredCertType: r.requiredCertType,
      requiresDrone: r.requiresDrone,
      notes: r.notes,
    }));
  }

  /** Case-insensitive serviceName lookup — used by the for-service resolver. */
  async findByServiceName(companyId: string, serviceName: string) {
    return this.prisma.serviceRequirement.findFirst({
      where: { companyId, serviceName: { equals: serviceName, mode: 'insensitive' } },
    });
  }

  async create(companyId: string, dto: CreateServiceRequirementDto) {
    return this.prisma.serviceRequirement.create({
      data: {
        companyId,
        serviceName: dto.serviceName,
        requiredCertType: dto.requiredCertType ?? null,
        requiresDrone: dto.requiresDrone ?? false,
        notes: dto.notes ?? null,
      },
    });
  }

  async update(id: string, companyId: string, dto: UpdateServiceRequirementDto) {
    const existing = await this.prisma.serviceRequirement.findFirst({ where: { id, companyId } });
    if (!existing) throw new NotFoundException('Requisito de servicio no encontrado');
    return this.prisma.serviceRequirement.update({
      where: { id },
      data: {
        serviceName: dto.serviceName ?? undefined,
        requiredCertType: dto.requiredCertType !== undefined ? dto.requiredCertType : undefined,
        requiresDrone: dto.requiresDrone ?? undefined,
        notes: dto.notes ?? undefined,
      },
    });
  }

  async remove(id: string, companyId: string) {
    const existing = await this.prisma.serviceRequirement.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Requisito de servicio no encontrado');
    await this.prisma.serviceRequirement.delete({ where: { id } });
    return { id, deleted: true };
  }
}
