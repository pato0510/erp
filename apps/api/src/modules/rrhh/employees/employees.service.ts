import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AreaRRHH, EmployeeStatus, Prisma } from '@prisma/client';
import { cleanRut, validateRut } from '@erp/utils';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { UpsertCompensationDto } from './dto/upsert-compensation.dto';

interface ListFilters {
  area?: AreaRRHH;
  status?: EmployeeStatus;
  jobPositionId?: string;
  search?: string;
}

/* THE SECURITY CRUX — this projection NEVER includes the `compensation`
 * relation, and the Employee model has zero salary/bank scalar fields, so the
 * list/create/update/deactivate payloads cannot carry compensation. Salary/bank
 * are reachable only via getCompensation (role-restricted at the controller). */
const EMPLOYEE_SELECT = {
  id: true,
  fullName: true,
  rut: true,
  area: true,
  status: true,
  contractType: true,
  userId: true,
  jobPositionId: true,
  companyEmail: true,
  personalEmail: true,
  phone: true,
  base: true,
  hireDate: true,
  jobPosition: { select: { id: true, name: true } },
} satisfies Prisma.EmployeeSelect;

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  async findAll(companyId: string, filters: ListFilters = {}) {
    const where: Prisma.EmployeeWhereInput = { companyId };
    if (filters.area) where.area = filters.area;
    if (filters.status) where.status = filters.status;
    if (filters.jobPositionId) where.jobPositionId = filters.jobPositionId;
    if (filters.search) {
      const q = filters.search.trim();
      where.OR = [
        { fullName: { contains: q, mode: 'insensitive' } },
        { rut: { contains: cleanRut(q) } },
      ];
    }
    return this.prisma.employee.findMany({
      where,
      select: EMPLOYEE_SELECT,
      orderBy: [{ status: 'asc' }, { fullName: 'asc' }],
    });
  }

  async findOne(id: string, companyId: string) {
    // Ficha — personal data + cargo/supervisor/user. NO compensation relation.
    const employee = await this.prisma.employee.findFirst({
      where: { id, companyId },
      include: {
        jobPosition: { select: { id: true, name: true, area: true } },
        supervisor: { select: { id: true, fullName: true } },
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });
    if (!employee) throw new NotFoundException('Trabajador no encontrado');
    return employee;
  }

  /** Validate Módulo-11 and return the canonical (separator-free) RUT used for
   * storage + the (companyId, rut) uniqueness constraint. */
  private normalizeRut(rut: string): string {
    if (!validateRut(rut)) {
      throw new BadRequestException('RUT inválido (dígito verificador no coincide).');
    }
    return cleanRut(rut);
  }

  async create(companyId: string, userId: string, dto: CreateEmployeeDto) {
    const rut = this.normalizeRut(dto.rut);
    try {
      return await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.employee.create({
          data: {
            companyId,
            createdBy: userId,
            fullName: dto.fullName,
            rut,
            userId: dto.userId ?? null,
            birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
            nationality: dto.nationality ?? null,
            personalEmail: dto.personalEmail ?? null,
            companyEmail: dto.companyEmail ?? null,
            phone: dto.phone ?? null,
            address: dto.address ?? null,
            emergencyContact: dto.emergencyContact ?? null,
            emergencyPhone: dto.emergencyPhone ?? null,
            jobPositionId: dto.jobPositionId ?? null,
            area: dto.area,
            supervisorId: dto.supervisorId ?? null,
            base: dto.base ?? null,
            hireDate: new Date(dto.hireDate),
            status: dto.status ?? EmployeeStatus.ACTIVO,
            contractType: dto.contractType ?? null,
            notes: dto.notes ?? null,
          },
          select: EMPLOYEE_SELECT,
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException('Ya existe un trabajador con ese RUT en la empresa.');
      }
      throw err;
    }
  }

  async update(id: string, companyId: string, userId: string, dto: UpdateEmployeeDto) {
    await this.findOne(id, companyId);
    const data: Prisma.EmployeeUncheckedUpdateInput = { updatedBy: userId };
    if (dto.fullName !== undefined) data.fullName = dto.fullName;
    if (dto.rut !== undefined) data.rut = this.normalizeRut(dto.rut);
    if (dto.userId !== undefined) data.userId = dto.userId || null;
    if (dto.jobPositionId !== undefined) data.jobPositionId = dto.jobPositionId || null;
    if (dto.supervisorId !== undefined) data.supervisorId = dto.supervisorId || null;
    if (dto.area !== undefined) data.area = dto.area;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.contractType !== undefined) data.contractType = dto.contractType ?? null;
    if (dto.base !== undefined) data.base = dto.base || null;
    if (dto.nationality !== undefined) data.nationality = dto.nationality || null;
    if (dto.personalEmail !== undefined) data.personalEmail = dto.personalEmail || null;
    if (dto.companyEmail !== undefined) data.companyEmail = dto.companyEmail || null;
    if (dto.phone !== undefined) data.phone = dto.phone || null;
    if (dto.address !== undefined) data.address = dto.address || null;
    if (dto.emergencyContact !== undefined) data.emergencyContact = dto.emergencyContact || null;
    if (dto.emergencyPhone !== undefined) data.emergencyPhone = dto.emergencyPhone || null;
    if (dto.birthDate !== undefined)
      data.birthDate = dto.birthDate ? new Date(dto.birthDate) : null;
    if (dto.hireDate !== undefined) data.hireDate = new Date(dto.hireDate);
    if (dto.notes !== undefined) data.notes = dto.notes || null;
    try {
      return await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.employee.update({ where: { id }, data, select: EMPLOYEE_SELECT });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException('Ya existe un trabajador con ese RUT en la empresa.');
      }
      throw err;
    }
  }

  /** Soft-delete → status DESVINCULADO (never hard-delete; payroll/contract
   * history references the row). */
  async deactivate(id: string, companyId: string, userId: string) {
    await this.findOne(id, companyId);
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.employee.update({
        where: { id },
        data: { status: EmployeeStatus.DESVINCULADO, updatedBy: userId },
        select: EMPLOYEE_SELECT,
      });
    });
  }

  // ── Compensation (guarded 1:1 sub-resource) — role restriction is enforced
  //    at the controller; here we just scope by company. Returns null when the
  //    employee has no compensation row yet. ──
  async getCompensation(employeeId: string, companyId: string) {
    await this.findOne(employeeId, companyId);
    return this.prisma.employeeCompensation.findFirst({ where: { employeeId, companyId } });
  }

  async upsertCompensation(
    employeeId: string,
    companyId: string,
    userId: string,
    dto: UpsertCompensationDto,
  ) {
    await this.findOne(employeeId, companyId);
    const fields = {
      baseSalaryGross: dto.baseSalaryGross,
      afp: dto.afp ?? null,
      health: dto.health ?? null,
      bank: dto.bank ?? null,
      bankAccountType: dto.bankAccountType ?? null,
      bankAccount: dto.bankAccount ?? null,
    };
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.employeeCompensation.upsert({
        where: { employeeId },
        create: { companyId, employeeId, createdBy: userId, ...fields },
        update: { ...fields, updatedBy: userId },
      });
    });
  }
}
