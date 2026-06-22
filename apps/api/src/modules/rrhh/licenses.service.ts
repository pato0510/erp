import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateLicenseDto } from './dto/create-license.dto';

@Injectable()
export class LicensesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string) {
    const licenses = await this.prisma.license.findMany({
      where: { companyId },
      orderBy: { fechaInicio: 'desc' },
      include: { employee: { select: { id: true, nombres: true, apellidos: true } } },
    });
    return licenses.map((l) => ({
      id: l.id,
      employeeId: l.employeeId,
      nombre: `${l.employee.nombres} ${l.employee.apellidos}`.trim(),
      tipo: l.tipo,
      fechaInicio: l.fechaInicio,
      fechaFin: l.fechaFin,
      dias: l.dias,
      folio: l.folio,
      estado: l.estado,
    }));
  }

  async findByEmployee(employeeId: string, companyId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException('Trabajador no encontrado');
    return this.prisma.license.findMany({
      where: { employeeId, companyId },
      orderBy: { fechaInicio: 'desc' },
    });
  }

  async create(companyId: string, dto: CreateLicenseDto) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, companyId },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException('Trabajador no encontrado');

    return this.prisma.license.create({
      data: {
        companyId,
        employeeId: dto.employeeId,
        tipo: dto.tipo,
        fechaInicio: new Date(dto.fechaInicio),
        fechaFin: new Date(dto.fechaFin),
        dias: dto.dias,
        folio: dto.folio ?? null,
        estado: dto.estado ?? undefined,
      },
    });
  }
}
