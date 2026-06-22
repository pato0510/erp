import { Injectable, NotFoundException } from '@nestjs/common';
import { EmployeeDocumentStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateEmployeeDocumentDto } from './dto/create-employee-document.dto';
import { UpdateEmployeeDocumentDto } from './dto/update-employee-document.dto';
import { deriveDocumentStatus, diasRestantes } from './rrhh.helpers';

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  private decorate(doc: {
    id: string;
    employeeId: string;
    tipoDocumento: string;
    nombre: string;
    fechaEmision: Date | null;
    fechaVencimiento: Date | null;
    estado: EmployeeDocumentStatus;
    fileName: string | null;
    mimeType: string | null;
  }) {
    return {
      ...doc,
      estado: deriveDocumentStatus(doc.fechaVencimiento, doc.estado),
      diasRestantes: diasRestantes(doc.fechaVencimiento),
    };
  }

  async findByEmployee(employeeId: string, companyId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException('Trabajador no encontrado');

    const docs = await this.prisma.employeeDocument.findMany({
      where: { employeeId, companyId },
      orderBy: { createdAt: 'desc' },
    });
    return docs.map((d) => this.decorate(d));
  }

  /** All documents across workers — drives the alert center. */
  async findAll(companyId: string) {
    const docs = await this.prisma.employeeDocument.findMany({
      where: { companyId },
      orderBy: { fechaVencimiento: 'asc' },
      include: { employee: { select: { id: true, nombres: true, apellidos: true } } },
    });
    return docs.map((d) => ({
      ...this.decorate(d),
      nombreTrabajador: `${d.employee.nombres} ${d.employee.apellidos}`.trim(),
    }));
  }

  async create(employeeId: string, companyId: string, dto: CreateEmployeeDocumentDto) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException('Trabajador no encontrado');

    const fechaVencimiento = dto.fechaVencimiento ? new Date(dto.fechaVencimiento) : null;
    const estado = deriveDocumentStatus(fechaVencimiento);

    const created = await this.prisma.employeeDocument.create({
      data: {
        companyId,
        employeeId,
        tipoDocumento: dto.tipoDocumento,
        nombre: dto.nombre,
        fechaEmision: dto.fechaEmision ? new Date(dto.fechaEmision) : null,
        fechaVencimiento,
        estado,
        fileName: dto.fileName ?? null,
        mimeType: dto.mimeType ?? null,
      },
    });
    return this.decorate(created);
  }

  async update(id: string, companyId: string, dto: UpdateEmployeeDocumentDto) {
    const existing = await this.prisma.employeeDocument.findFirst({
      where: { id, companyId },
    });
    if (!existing) throw new NotFoundException('Documento no encontrado');

    const fechaVencimiento =
      dto.fechaVencimiento !== undefined
        ? dto.fechaVencimiento
          ? new Date(dto.fechaVencimiento)
          : null
        : existing.fechaVencimiento;

    const updated = await this.prisma.employeeDocument.update({
      where: { id },
      data: {
        tipoDocumento: dto.tipoDocumento ?? undefined,
        nombre: dto.nombre ?? undefined,
        fechaEmision:
          dto.fechaEmision !== undefined
            ? dto.fechaEmision
              ? new Date(dto.fechaEmision)
              : null
            : undefined,
        fechaVencimiento: dto.fechaVencimiento !== undefined ? fechaVencimiento : undefined,
        fileName: dto.fileName ?? undefined,
        mimeType: dto.mimeType ?? undefined,
        estado: deriveDocumentStatus(fechaVencimiento, existing.estado),
      },
    });
    return this.decorate(updated);
  }

  async remove(id: string, companyId: string) {
    const existing = await this.prisma.employeeDocument.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Documento no encontrado');
    await this.prisma.employeeDocument.delete({ where: { id } });
    return { id, deleted: true };
  }
}
