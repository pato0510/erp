import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  /** List with a flattened active-contract summary for the trabajadores grid. */
  async findAll(companyId: string) {
    const employees = await this.prisma.employee.findMany({
      where: { companyId },
      orderBy: [{ apellidos: 'asc' }, { nombres: 'asc' }],
      include: {
        contracts: {
          where: { activo: true },
          orderBy: { fechaInicio: 'desc' },
          take: 1,
        },
      },
    });

    return employees.map((e) => {
      const c = e.contracts[0];
      return {
        id: e.id,
        rut: e.rut,
        nombres: e.nombres,
        apellidos: e.apellidos,
        nombre: `${e.nombres} ${e.apellidos}`.trim(),
        email: e.email,
        area: e.area,
        cargo: e.cargo,
        estado: e.estado,
        fechaIngreso: e.fechaIngreso,
        tipoContrato: c?.tipoContrato ?? null,
        sueldoBruto: c ? Number(c.sueldoBruto) : null,
        afp: c?.afp ?? null,
        salud: c?.salud ?? null,
      };
    });
  }

  /** Full ficha including the active contract and counts. */
  async findOne(id: string, companyId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, companyId },
      include: {
        contracts: { orderBy: { fechaInicio: 'desc' } },
        documents: { orderBy: { createdAt: 'desc' } },
        vacations: { orderBy: { fechaCorte: 'desc' } },
        licenses: { orderBy: { fechaInicio: 'desc' } },
      },
    });
    if (!employee) throw new NotFoundException('Trabajador no encontrado');

    const activeContract = employee.contracts.find((c) => c.activo) ?? employee.contracts[0] ?? null;

    return {
      ...employee,
      nombre: `${employee.nombres} ${employee.apellidos}`.trim(),
      activeContract: activeContract
        ? { ...activeContract, sueldoBruto: Number(activeContract.sueldoBruto) }
        : null,
    };
  }

  /** Loads the active contract (with numeric sueldoBruto) for a worker. */
  async getActiveContract(employeeId: string, companyId: string) {
    const contract = await this.prisma.employeeContract.findFirst({
      where: { employeeId, companyId, activo: true },
      orderBy: { fechaInicio: 'desc' },
    });
    return contract ? { ...contract, sueldoBruto: Number(contract.sueldoBruto) } : null;
  }

  async create(companyId: string, dto: CreateEmployeeDto) {
    try {
      return await this.prisma.employee.create({
        data: {
          companyId,
          rut: dto.rut,
          nombres: dto.nombres,
          apellidos: dto.apellidos,
          email: dto.email ?? null,
          telefono: dto.telefono ?? null,
          direccion: dto.direccion ?? null,
          comuna: dto.comuna ?? null,
          ciudad: dto.ciudad ?? null,
          fechaNacimiento: dto.fechaNacimiento ? new Date(dto.fechaNacimiento) : null,
          fechaIngreso: new Date(dto.fechaIngreso),
          area: dto.area,
          cargo: dto.cargo,
          contracts: {
            create: {
              companyId,
              tipoContrato: dto.tipoContrato,
              sueldoBruto: new Prisma.Decimal(dto.sueldoBruto),
              jornada: dto.jornada ?? '45h',
              cargo: dto.cargo,
              fechaInicio: dto.fechaInicioContrato
                ? new Date(dto.fechaInicioContrato)
                : new Date(dto.fechaIngreso),
              fechaFin: dto.fechaFinContrato ? new Date(dto.fechaFinContrato) : null,
              afp: dto.afp,
              salud: dto.salud,
              activo: dto.activo ?? true,
            },
          },
        },
        include: { contracts: true },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException('Ya existe un trabajador con ese RUT.');
      }
      throw err;
    }
  }

  async update(id: string, companyId: string, dto: UpdateEmployeeDto) {
    await this.findOne(id, companyId);

    const employeeData: Prisma.EmployeeUpdateInput = {};
    if (dto.nombres !== undefined) employeeData.nombres = dto.nombres;
    if (dto.apellidos !== undefined) employeeData.apellidos = dto.apellidos;
    if (dto.email !== undefined) employeeData.email = dto.email;
    if (dto.telefono !== undefined) employeeData.telefono = dto.telefono;
    if (dto.direccion !== undefined) employeeData.direccion = dto.direccion;
    if (dto.comuna !== undefined) employeeData.comuna = dto.comuna;
    if (dto.ciudad !== undefined) employeeData.ciudad = dto.ciudad;
    if (dto.fechaNacimiento !== undefined)
      employeeData.fechaNacimiento = dto.fechaNacimiento ? new Date(dto.fechaNacimiento) : null;
    if (dto.fechaIngreso !== undefined) employeeData.fechaIngreso = new Date(dto.fechaIngreso);
    if (dto.area !== undefined) employeeData.area = dto.area;
    if (dto.cargo !== undefined) employeeData.cargo = dto.cargo;
    if (dto.estado !== undefined) employeeData.estado = dto.estado;

    // Update the active contract in place if any contract field is present.
    const touchesContract =
      dto.tipoContrato !== undefined ||
      dto.sueldoBruto !== undefined ||
      dto.jornada !== undefined ||
      dto.afp !== undefined ||
      dto.salud !== undefined ||
      dto.cargo !== undefined;

    return this.prisma.$transaction(async (tx) => {
      await tx.employee.update({ where: { id }, data: employeeData });

      if (touchesContract) {
        const active = await tx.employeeContract.findFirst({
          where: { employeeId: id, companyId, activo: true },
          orderBy: { fechaInicio: 'desc' },
        });
        if (active) {
          await tx.employeeContract.update({
            where: { id: active.id },
            data: {
              tipoContrato: dto.tipoContrato ?? undefined,
              sueldoBruto:
                dto.sueldoBruto !== undefined ? new Prisma.Decimal(dto.sueldoBruto) : undefined,
              jornada: dto.jornada ?? undefined,
              afp: dto.afp ?? undefined,
              salud: dto.salud ?? undefined,
              cargo: dto.cargo ?? undefined,
            },
          });
        }
      }

      return this.findOne(id, companyId);
    });
  }

  async remove(id: string, companyId: string) {
    await this.findOne(id, companyId);
    await this.prisma.employee.delete({ where: { id } });
    return { id, deleted: true };
  }
}
