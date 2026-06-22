import { Injectable, NotFoundException } from '@nestjs/common';
import { CertificationStatus, CertificationType } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateCertificationDto } from './dto/create-certification.dto';
import { UpdateCertificationDto } from './dto/update-certification.dto';
import { deriveCertStatus, diasRestantes } from './rrhh.helpers';

type CertRow = {
  id: string;
  employeeId: string;
  name: string;
  type: CertificationType;
  issuedDate: Date | null;
  expiryDate: Date | null;
  documentRef: string | null;
  employee: { nombres: string; apellidos: string; cargo: string };
};

@Injectable()
export class CertificationsService {
  constructor(private readonly prisma: PrismaService) {}

  private decorate(c: CertRow) {
    return {
      id: c.id,
      employeeId: c.employeeId,
      employeeName: `${c.employee.nombres} ${c.employee.apellidos}`.trim(),
      cargo: c.employee.cargo,
      name: c.name,
      type: c.type,
      issuedDate: c.issuedDate,
      expiryDate: c.expiryDate,
      status: deriveCertStatus(c.expiryDate),
      diasRestantes: diasRestantes(c.expiryDate),
      documentRef: c.documentRef,
    };
  }

  private readonly include = {
    employee: { select: { nombres: true, apellidos: true, cargo: true } },
  } as const;

  /** List with optional employeeId / type / status filters (status derived). */
  async findAll(
    companyId: string,
    filters: { employeeId?: string; type?: CertificationType; status?: CertificationStatus } = {},
  ) {
    const rows = await this.prisma.certification.findMany({
      where: {
        companyId,
        ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
        ...(filters.type ? { type: filters.type } : {}),
      },
      orderBy: { expiryDate: 'asc' },
      include: this.include,
    });
    const decorated = rows.map((c) => this.decorate(c));
    return filters.status ? decorated.filter((c) => c.status === filters.status) : decorated;
  }

  /** POR_VENCER + VENCIDA certifications, soonest first — drives the alert feed. */
  async findExpiring(companyId: string) {
    const rows = await this.prisma.certification.findMany({
      where: { companyId },
      orderBy: { expiryDate: 'asc' },
      include: this.include,
    });
    return rows
      .map((c) => this.decorate(c))
      .filter(
        (c) =>
          c.status === CertificationStatus.POR_VENCER ||
          c.status === CertificationStatus.VENCIDA,
      )
      .sort((a, b) => (a.diasRestantes ?? 0) - (b.diasRestantes ?? 0));
  }

  async findOne(id: string, companyId: string) {
    const cert = await this.prisma.certification.findFirst({
      where: { id, companyId },
      include: this.include,
    });
    if (!cert) throw new NotFoundException('Certificación no encontrada');
    return this.decorate(cert);
  }

  async create(companyId: string, dto: CreateCertificationDto) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, companyId },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException('Trabajador no encontrado');

    const expiryDate = dto.expiryDate ? new Date(dto.expiryDate) : null;
    const created = await this.prisma.certification.create({
      data: {
        companyId,
        employeeId: dto.employeeId,
        name: dto.name,
        type: dto.type,
        issuedDate: dto.issuedDate ? new Date(dto.issuedDate) : null,
        expiryDate,
        status: deriveCertStatus(expiryDate),
        documentRef: dto.documentRef ?? null,
      },
      include: this.include,
    });
    return this.decorate(created);
  }

  async update(id: string, companyId: string, dto: UpdateCertificationDto) {
    const existing = await this.prisma.certification.findFirst({ where: { id, companyId } });
    if (!existing) throw new NotFoundException('Certificación no encontrada');

    const expiryDate =
      dto.expiryDate !== undefined
        ? dto.expiryDate
          ? new Date(dto.expiryDate)
          : null
        : existing.expiryDate;

    const updated = await this.prisma.certification.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        type: dto.type ?? undefined,
        issuedDate:
          dto.issuedDate !== undefined
            ? dto.issuedDate
              ? new Date(dto.issuedDate)
              : null
            : undefined,
        expiryDate: dto.expiryDate !== undefined ? expiryDate : undefined,
        documentRef: dto.documentRef ?? undefined,
        status: deriveCertStatus(expiryDate),
      },
      include: this.include,
    });
    return this.decorate(updated);
  }

  async remove(id: string, companyId: string) {
    const existing = await this.prisma.certification.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Certificación no encontrada');
    await this.prisma.certification.delete({ where: { id } });
    return { id, deleted: true };
  }
}
