import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContractStatus, ContractType, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { CreateEmployeeContractDto } from './dto/create-employee-contract.dto';
import { TerminateContractDto } from './dto/terminate-contract.dto';
import { UpdateEmployeeContractDto } from './dto/update-employee-contract.dto';

/* contractTypes that legally require an end date. */
const FIXED_TERM_TYPES: ContractType[] = ['PLAZO_FIJO', 'POR_OBRA'];

const CONTRACT_INCLUDE = {
  supervisor: { select: { id: true, fullName: true } },
  document: { select: { id: true, fileName: true } },
} satisfies Prisma.EmployeeContractInclude;

@Injectable()
export class EmployeeContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  private requireEndDate(contractType: ContractType, endDate: Date | null) {
    if (FIXED_TERM_TYPES.includes(contractType) && !endDate) {
      throw new BadRequestException(
        'Los contratos a PLAZO_FIJO o POR_OBRA requieren fecha de término (endDate).',
      );
    }
  }

  /* The DB-level partial unique index (employee_contracts_principal_vigente_unique,
     WHERE parentContractId IS NULL AND status='VIGENTE') is the infallible backstop
     for the one-principal-VIGENTE rule. The service supersedes the prior principal
     first, so this only trips on a concurrent-write race — translate that P2002
     into a clean 409 instead of a raw Prisma error. It's the only unique index on
     the table, so any P2002 here is that race. */
  private translateConflict(err: unknown): unknown {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return new ConflictException(
        'Ya existe un contrato principal vigente para este trabajador. Actualiza o reemplaza el contrato vigente.',
      );
    }
    return err;
  }

  /* Validates that every referenced row belongs to the company (and the parent
     to the same employee) — guards against cross-tenant references. */
  private async validateRefs(
    companyId: string,
    employeeId: string,
    refs: {
      supervisorId?: string | null;
      documentId?: string | null;
      parentContractId?: string | null;
    },
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId },
      select: { id: true },
    });
    if (!employee) throw new BadRequestException('El trabajador no existe en esta empresa.');

    if (refs.supervisorId) {
      const sup = await this.prisma.employee.findFirst({
        where: { id: refs.supervisorId, companyId },
        select: { id: true },
      });
      if (!sup) throw new BadRequestException('El supervisor indicado no existe en esta empresa.');
    }
    if (refs.documentId) {
      const doc = await this.prisma.employeeDocument.findFirst({
        where: { id: refs.documentId, companyId, employeeId },
        select: { id: true },
      });
      if (!doc) {
        throw new BadRequestException(
          'El documento vinculado no existe o no pertenece a este trabajador.',
        );
      }
    }
    if (refs.parentContractId) {
      const parent = await this.prisma.employeeContract.findFirst({
        where: { id: refs.parentContractId, companyId, employeeId },
        select: { id: true, parentContractId: true },
      });
      if (!parent) {
        throw new BadRequestException(
          'El contrato principal (parentContractId) no existe o no pertenece a este trabajador.',
        );
      }
      if (parent.parentContractId) {
        throw new BadRequestException('Un anexo no puede colgar de otro anexo.');
      }
    }
  }

  async findAll(companyId: string, employeeId: string) {
    if (!employeeId) throw new BadRequestException('employeeId es obligatorio.');
    const rows = await this.prisma.employeeContract.findMany({
      where: { companyId, employeeId },
      include: CONTRACT_INCLUDE,
      orderBy: [{ parentContractId: 'asc' }, { startDate: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((r) => ({ ...r, isAnexo: r.parentContractId !== null }));
  }

  async findOne(id: string, companyId: string) {
    const row = await this.prisma.employeeContract.findFirst({
      where: { id, companyId },
      include: {
        ...CONTRACT_INCLUDE,
        anexos: { include: CONTRACT_INCLUDE, orderBy: { startDate: 'desc' } },
        parent: { select: { id: true, contractType: true, status: true } },
      },
    });
    if (!row) throw new NotFoundException('Contrato no encontrado');
    return { ...row, isAnexo: row.parentContractId !== null };
  }

  async create(companyId: string, userId: string, dto: CreateEmployeeContractDto) {
    const endDate = dto.endDate ? new Date(dto.endDate) : null;
    this.requireEndDate(dto.contractType, endDate);
    await this.validateRefs(companyId, dto.employeeId, {
      supervisorId: dto.supervisorId ?? null,
      documentId: dto.documentId ?? null,
      parentContractId: dto.parentContractId ?? null,
    });

    const isAnexo = !!dto.parentContractId;
    const status: ContractStatus = dto.status ?? 'VIGENTE';

    try {
      return await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        /* KEY RULE — exactly one PRINCIPAL (parentContractId NULL) VIGENTE contract
         per employee. Creating a new principal VIGENTE supersedes the prior one
         atomically (same tx). Anexos are exempt. The partial unique index backstops
         this against concurrent races. */
        if (!isAnexo && status === 'VIGENTE') {
          await tx.employeeContract.updateMany({
            where: {
              companyId,
              employeeId: dto.employeeId,
              parentContractId: null,
              status: 'VIGENTE',
            },
            data: { status: 'REEMPLAZADO', updatedBy: userId },
          });
        }
        return tx.employeeContract.create({
          data: {
            companyId,
            createdBy: userId,
            employeeId: dto.employeeId,
            contractType: dto.contractType,
            startDate: new Date(dto.startDate),
            endDate,
            contractualRole: dto.contractualRole ?? null,
            workSchedule: dto.workSchedule,
            baseSalary: dto.baseSalary,
            gratification: dto.gratification ?? 'NO',
            gratificationAmount: dto.gratificationAmount ?? null,
            mealAllowance: dto.mealAllowance ?? null,
            transportAllowance: dto.transportAllowance ?? null,
            workLocation: dto.workLocation ?? null,
            mainDuties: dto.mainDuties ?? null,
            supervisorId: dto.supervisorId ?? null,
            documentId: dto.documentId ?? null,
            parentContractId: dto.parentContractId ?? null,
            status,
            notes: dto.notes ?? null,
          },
          include: CONTRACT_INCLUDE,
        });
      });
    } catch (err) {
      throw this.translateConflict(err);
    }
  }

  async update(id: string, companyId: string, userId: string, dto: UpdateEmployeeContractDto) {
    const existing = await this.prisma.employeeContract.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        employeeId: true,
        contractType: true,
        endDate: true,
        status: true,
        parentContractId: true,
      },
    });
    if (!existing) throw new NotFoundException('Contrato no encontrado');

    const effectiveType = dto.contractType ?? existing.contractType;
    const effectiveEndDate =
      dto.endDate !== undefined ? (dto.endDate ? new Date(dto.endDate) : null) : existing.endDate;
    this.requireEndDate(effectiveType, effectiveEndDate);

    if (dto.supervisorId !== undefined || dto.documentId !== undefined) {
      await this.validateRefs(companyId, existing.employeeId, {
        supervisorId: dto.supervisorId ?? null,
        documentId: dto.documentId ?? null,
      });
    }

    const effectiveStatus = dto.status ?? existing.status;
    const isPrincipal = existing.parentContractId === null;

    const data: Prisma.EmployeeContractUncheckedUpdateInput = { updatedBy: userId };
    if (dto.contractType !== undefined) data.contractType = dto.contractType;
    if (dto.startDate !== undefined) data.startDate = new Date(dto.startDate);
    if (dto.endDate !== undefined) data.endDate = dto.endDate ? new Date(dto.endDate) : null;
    if (dto.contractualRole !== undefined) data.contractualRole = dto.contractualRole || null;
    if (dto.workSchedule !== undefined) data.workSchedule = dto.workSchedule;
    if (dto.baseSalary !== undefined) data.baseSalary = dto.baseSalary;
    if (dto.gratification !== undefined) data.gratification = dto.gratification;
    if (dto.gratificationAmount !== undefined) data.gratificationAmount = dto.gratificationAmount;
    if (dto.mealAllowance !== undefined) data.mealAllowance = dto.mealAllowance;
    if (dto.transportAllowance !== undefined) data.transportAllowance = dto.transportAllowance;
    if (dto.workLocation !== undefined) data.workLocation = dto.workLocation || null;
    if (dto.mainDuties !== undefined) data.mainDuties = dto.mainDuties || null;
    if (dto.supervisorId !== undefined) data.supervisorId = dto.supervisorId || null;
    if (dto.documentId !== undefined) data.documentId = dto.documentId || null;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.notes !== undefined) data.notes = dto.notes || null;

    try {
      return await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        /* If this update leaves the contract a principal in VIGENTE, it must remain
           the only such row — supersede any OTHER principal VIGENTE (atomic). */
        if (isPrincipal && effectiveStatus === 'VIGENTE') {
          await tx.employeeContract.updateMany({
            where: {
              companyId,
              employeeId: existing.employeeId,
              parentContractId: null,
              status: 'VIGENTE',
              id: { not: id },
            },
            data: { status: 'REEMPLAZADO', updatedBy: userId },
          });
        }
        return tx.employeeContract.update({ where: { id }, data, include: CONTRACT_INCLUDE });
      });
    } catch (err) {
      throw this.translateConflict(err);
    }
  }

  async terminate(id: string, companyId: string, userId: string, dto: TerminateContractDto) {
    const existing = await this.prisma.employeeContract.findFirst({
      where: { id, companyId },
      select: { id: true, notes: true },
    });
    if (!existing) throw new NotFoundException('Contrato no encontrado');

    const when = dto.date
      ? new Date(dto.date).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const note = `[Terminado ${when}]${dto.reason ? ` ${dto.reason}` : ''}`;
    const mergedNotes = existing.notes ? `${existing.notes}\n\n${note}` : note;

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.employeeContract.update({
        where: { id },
        data: { status: 'TERMINADO', notes: mergedNotes, updatedBy: userId },
        include: CONTRACT_INCLUDE,
      });
    });
  }

  async remove(id: string, companyId: string, userId: string) {
    const existing = await this.prisma.employeeContract.findFirst({
      where: { id, companyId },
      select: { id: true, _count: { select: { anexos: true } } },
    });
    if (!existing) throw new NotFoundException('Contrato no encontrado');
    if (existing._count.anexos > 0) {
      throw new BadRequestException(
        'No se puede eliminar un contrato con anexos. Elimina primero los anexos.',
      );
    }
    await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.employeeContract.delete({ where: { id } });
    });
    return { id, deleted: true };
  }
}
