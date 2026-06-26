import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { VacationsService } from '../vacations/vacations.service';
import { CreateTerminationDto } from './dto/create-termination.dto';
import { EstimateTerminationDto } from './dto/estimate-termination.dto';
import { computeFiniquito, FiniquitoInput } from './termination-calc';

@Injectable()
export class TerminationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
    private readonly vacations: VacationsService,
  ) {}

  private async getEmployeeOrThrow(employeeId: string, companyId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId },
      select: { id: true, hireDate: true, status: true },
    });
    if (!employee) throw new BadRequestException('El trabajador no existe en esta empresa.');
    return employee;
  }

  /* Resolve the computeFiniquito inputs: baseMonthly defaults from
     EmployeeCompensation.baseSalaryGross (editable via the dto); feriadoDias
     defaults from the HR-011 vacation saldo (clamped to ≥ 0; editable via the
     dto). Shared by estimate() and create() so both compute identically. */
  private async buildInput(
    companyId: string,
    dto: EstimateTerminationDto | CreateTerminationDto,
  ): Promise<FiniquitoInput> {
    const employee = await this.getEmployeeOrThrow(dto.employeeId, companyId);

    let baseMonthly = dto.baseMonthly;
    if (baseMonthly === undefined) {
      const comp = await this.prisma.employeeCompensation.findFirst({
        where: { companyId, employeeId: dto.employeeId },
        select: { baseSalaryGross: true },
      });
      baseMonthly = comp ? Number(comp.baseSalaryGross) : 0;
    }

    let feriadoDias = dto.feriadoDias;
    if (feriadoDias === undefined) {
      try {
        const balance = await this.vacations.getBalance(companyId, dto.employeeId);
        feriadoDias = Math.max(0, balance.saldoDisponible);
      } catch {
        feriadoDias = 0; // no HR-011 balance available → admin can enter it manually
      }
    }

    return {
      causal: dto.causal,
      ufValue: dto.ufValue,
      baseMonthly,
      hireDate: employee.hireDate,
      terminationDate: new Date(dto.terminationDate),
      avisoPrevioDado: dto.avisoPrevioDado,
      feriadoDias,
    };
  }

  /* EPHEMERAL — runs the calc and returns the breakdown + disclaimer. Writes
     NOTHING to the database. */
  async estimate(companyId: string, dto: EstimateTerminationDto) {
    const input = await this.buildInput(companyId, dto);
    return computeFiniquito(input);
  }

  /* PERSIST — the explicit "registrar finiquito" action. The service RE-COMPUTES
     the breakdown from the inputs (never trusts client-sent amounts) and stores
     it. When markEmployeeDesvinculado is true, the employee status flips to
     DESVINCULADO in the SAME executeWithRls transaction (atomic). */
  async create(companyId: string, userId: string, dto: CreateTerminationDto) {
    const input = await this.buildInput(companyId, dto);
    const b = computeFiniquito(input);

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const record = await tx.terminationRecord.create({
        data: {
          companyId,
          createdBy: userId,
          employeeId: dto.employeeId,
          causal: input.causal,
          terminationDate: input.terminationDate,
          ufValueUsed: input.ufValue,
          baseMonthlyUsed: input.baseMonthly,
          aniosServicio: b.aniosServicio,
          aniosIndemnizables: b.aniosIndemnizables,
          montoIas: b.montoIas,
          montoAvisoPrevio: b.montoAvisoPrevio,
          feriadoDias: input.feriadoDias,
          montoFeriado: b.montoFeriado,
          montoTotal: b.montoTotal,
          avisoPrevioDado: input.avisoPrevioDado,
          status: 'REGISTRADO',
          notes: dto.notes ?? null,
        },
      });

      if (dto.markEmployeeDesvinculado) {
        await tx.employee.update({
          where: { id: dto.employeeId },
          data: { status: 'DESVINCULADO', updatedBy: userId },
        });
      }

      return { record, breakdown: b, employeeMarkedDesvinculado: !!dto.markEmployeeDesvinculado };
    });
  }

  async findAll(companyId: string, employeeId: string) {
    if (!employeeId) throw new BadRequestException('employeeId es obligatorio.');
    return this.prisma.terminationRecord.findMany({
      where: { companyId, employeeId },
      orderBy: [{ terminationDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: string, companyId: string) {
    const row = await this.prisma.terminationRecord.findFirst({
      where: { id, companyId },
      include: { employee: { select: { id: true, fullName: true } } },
    });
    if (!row) throw new NotFoundException('Finiquito no encontrado');
    return row;
  }

  /* Anular — marks the record ANULADO. Does NOT auto-revert the employee status
     (that's a separate, deliberate manual action). */
  async anular(id: string, companyId: string, userId: string) {
    const existing = await this.prisma.terminationRecord.findFirst({
      where: { id, companyId },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException('Finiquito no encontrado');
    if (existing.status === 'ANULADO') {
      throw new BadRequestException('El finiquito ya está anulado.');
    }
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.terminationRecord.update({
        where: { id },
        data: { status: 'ANULADO', updatedBy: userId },
      });
    });
  }
}
