import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { CreateVacationRequestDto } from './dto/create-vacation-request.dto';
import { RejectVacationDto } from './dto/reject-vacation.dto';
import { UpdateVacationRequestDto } from './dto/update-vacation-request.dto';
import { VacationSettingsDto } from './dto/vacation-settings.dto';
import {
  computeBalance,
  countBusinessDays,
  DEFAULT_ANNUAL_DIAS_HABILES,
  startOfUtcDay,
} from './vacation-calc';

/* Fraccionamiento (Código del Trabajo): the feriado may be split, but at least
   one continuous block of 10 días hábiles must exist. V1 surfaces this as
   GUIDANCE on create, never a hard block. */
const FRACCIONAMIENTO_MIN_BLOCK = 10;

@Injectable()
export class VacationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  private utcToday(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  private async annualDays(companyId: string): Promise<number> {
    const settings = await this.prisma.companySettings.findUnique({
      where: { companyId },
      select: { feriadoAnualDiasHabiles: true },
    });
    return settings?.feriadoAnualDiasHabiles ?? DEFAULT_ANNUAL_DIAS_HABILES;
  }

  private async getEmployeeOrThrow(employeeId: string, companyId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId },
      select: { id: true, hireDate: true, diasAdicionalesFeriado: true },
    });
    if (!employee) throw new BadRequestException('El trabajador no existe en esta empresa.');
    return employee;
  }

  async findAll(companyId: string, employeeId: string) {
    if (!employeeId) throw new BadRequestException('employeeId es obligatorio.');
    return this.prisma.vacationRequest.findMany({
      where: { companyId, employeeId },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: string, companyId: string) {
    const row = await this.prisma.vacationRequest.findFirst({ where: { id, companyId } });
    if (!row) throw new NotFoundException('Solicitud de vacaciones no encontrada');
    return row;
  }

  /* The CERTIFIED computed balance (never stored). */
  async getBalance(companyId: string, employeeId: string) {
    const employee = await this.getEmployeeOrThrow(employeeId, companyId);
    const [annual, requests] = await Promise.all([
      this.annualDays(companyId),
      this.prisma.vacationRequest.findMany({
        where: { companyId, employeeId },
        select: { status: true, diasHabiles: true },
      }),
    ]);
    return computeBalance(
      employee.hireDate,
      this.utcToday(),
      annual,
      employee.diasAdicionalesFeriado,
      requests,
    );
  }

  async create(companyId: string, userId: string, dto: CreateVacationRequestDto) {
    const employee = await this.getEmployeeOrThrow(dto.employeeId, companyId);
    const start = startOfUtcDay(new Date(dto.startDate));
    const end = startOfUtcDay(new Date(dto.endDate));
    if (end.getTime() < start.getTime()) {
      throw new BadRequestException('La fecha de término no puede ser anterior a la de inicio.');
    }

    /* diasHabiles is computed Mon–Fri inclusive; admin may override for festivos. */
    const diasHabiles = dto.diasHabiles ?? countBusinessDays(start, end);

    /* WARN (do not block) when the request exceeds the available balance or
       breaches the fraccionamiento guidance — surfaced to the UI. */
    const warnings: string[] = [];
    const annual = await this.annualDays(companyId);
    const existing = await this.prisma.vacationRequest.findMany({
      where: { companyId, employeeId: dto.employeeId },
      select: { status: true, diasHabiles: true },
    });
    const balance = computeBalance(
      employee.hireDate,
      this.utcToday(),
      annual,
      employee.diasAdicionalesFeriado,
      existing,
    );
    /* Effective available also nets out other PENDIENTE requests so several
       pending requests can't each look affordable. */
    const available = balance.saldoDisponible - balance.pendientes;
    if (diasHabiles > available) {
      warnings.push(
        `La solicitud (${diasHabiles} días hábiles) supera el saldo disponible (${available} días hábiles considerando solicitudes pendientes).`,
      );
    }
    if (diasHabiles === 0) {
      warnings.push('El rango seleccionado no contiene días hábiles (sólo fin de semana).');
    }
    const hasLongBlock = existing.some(
      (r) =>
        (r.status === 'APROBADO' || r.status === 'TOMADO' || r.status === 'PENDIENTE') &&
        r.diasHabiles >= FRACCIONAMIENTO_MIN_BLOCK,
    );
    if (diasHabiles < FRACCIONAMIENTO_MIN_BLOCK && !hasLongBlock) {
      warnings.push(
        `Fraccionamiento: el feriado legal debe incluir al menos un período continuo de ${FRACCIONAMIENTO_MIN_BLOCK} días hábiles.`,
      );
    }

    const created = await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.vacationRequest.create({
        data: {
          companyId,
          createdBy: userId,
          employeeId: dto.employeeId,
          startDate: start,
          endDate: end,
          diasHabiles,
          status: 'PENDIENTE',
          requestedBy: userId,
          notes: dto.notes ?? null,
        },
      });
    });
    return { ...created, warnings };
  }

  async update(id: string, companyId: string, userId: string, dto: UpdateVacationRequestDto) {
    const existing = await this.prisma.vacationRequest.findFirst({
      where: { id, companyId },
      select: { id: true, status: true, startDate: true, endDate: true },
    });
    if (!existing) throw new NotFoundException('Solicitud de vacaciones no encontrada');
    if (existing.status !== 'PENDIENTE') {
      throw new BadRequestException('Sólo se pueden editar solicitudes en estado PENDIENTE.');
    }

    const start = dto.startDate ? startOfUtcDay(new Date(dto.startDate)) : existing.startDate;
    const end = dto.endDate ? startOfUtcDay(new Date(dto.endDate)) : existing.endDate;
    if (end.getTime() < start.getTime()) {
      throw new BadRequestException('La fecha de término no puede ser anterior a la de inicio.');
    }

    const data: Prisma.VacationRequestUncheckedUpdateInput = { updatedBy: userId };
    if (dto.startDate !== undefined) data.startDate = start;
    if (dto.endDate !== undefined) data.endDate = end;
    if (dto.notes !== undefined) data.notes = dto.notes || null;
    /* Explicit override wins (festivos); otherwise recompute if dates moved. */
    if (dto.diasHabiles !== undefined) {
      data.diasHabiles = dto.diasHabiles;
    } else if (dto.startDate !== undefined || dto.endDate !== undefined) {
      data.diasHabiles = countBusinessDays(start, end);
    }

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.vacationRequest.update({ where: { id }, data });
    });
  }

  async approve(id: string, companyId: string, userId: string) {
    const existing = await this.findOne(id, companyId);
    if (existing.status !== 'PENDIENTE') {
      throw new BadRequestException('Sólo se pueden aprobar solicitudes PENDIENTES.');
    }
    const now = new Date();
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.vacationRequest.update({
        where: { id },
        data: {
          status: 'APROBADO',
          approvedBy: userId,
          approvedAt: now,
          rejectionReason: null,
          updatedBy: userId,
        },
      });
    });
  }

  async reject(id: string, companyId: string, userId: string, dto: RejectVacationDto) {
    const existing = await this.findOne(id, companyId);
    if (existing.status !== 'PENDIENTE') {
      throw new BadRequestException('Sólo se pueden rechazar solicitudes PENDIENTES.');
    }
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.vacationRequest.update({
        where: { id },
        data: { status: 'RECHAZADO', rejectionReason: dto.reason, updatedBy: userId },
      });
    });
  }

  /* Cancel frees the balance simply by leaving the consumed set — a CANCELADO
     row no longer counts as APROBADO/TOMADO in computeBalance. Allowed from
     PENDIENTE or APROBADO (not from a row already TOMADO/RECHAZADO). */
  async cancel(id: string, companyId: string, userId: string) {
    const existing = await this.findOne(id, companyId);
    if (existing.status !== 'PENDIENTE' && existing.status !== 'APROBADO') {
      throw new BadRequestException('Sólo se pueden cancelar solicitudes PENDIENTES o APROBADAS.');
    }
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.vacationRequest.update({
        where: { id },
        data: { status: 'CANCELADO', updatedBy: userId },
      });
    });
  }

  async markTaken(id: string, companyId: string, userId: string) {
    const existing = await this.findOne(id, companyId);
    if (existing.status !== 'APROBADO') {
      throw new BadRequestException('Sólo se pueden marcar como TOMADAS solicitudes APROBADAS.');
    }
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.vacationRequest.update({
        where: { id },
        data: { status: 'TOMADO', updatedBy: userId },
      });
    });
  }

  /* The manual feriado-progresivo field, on the employee (admin only via CASL). */
  async setSettings(
    employeeId: string,
    companyId: string,
    userId: string,
    dto: VacationSettingsDto,
  ) {
    await this.getEmployeeOrThrow(employeeId, companyId);
    await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.employee.update({
        where: { id: employeeId },
        data: { diasAdicionalesFeriado: dto.diasAdicionalesFeriado, updatedBy: userId },
      });
    });
    return this.getBalance(companyId, employeeId);
  }
}
