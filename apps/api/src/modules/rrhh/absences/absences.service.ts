import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AbsenceCategory, AbsenceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { CreateAbsenceDto } from './dto/create-absence.dto';
import { RejectAbsenceDto } from './dto/reject-absence.dto';
import { UpdateAbsenceDto } from './dto/update-absence.dto';

/* NOTE: this service imports ONLY PrismaService + RlsService. Availability here
   is a SOFT, read-only marker over the absences table — it never imports, calls,
   or mutates Operations. Real cross-module enforcement is HR-016. */

const ABSENCE_INCLUDE = {
  absenceType: { select: { id: true, name: true, category: true, unit: true, withPay: true } },
  document: { select: { id: true, fileName: true } },
} satisfies Prisma.AbsenceInclude;

@Injectable()
export class AbsencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  private utcToday(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  private startOfUtcDay(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  private async getEmployeeOrThrow(employeeId: string, companyId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId },
      select: { id: true },
    });
    if (!employee) throw new BadRequestException('El trabajador no existe en esta empresa.');
    return employee;
  }

  async findAll(
    companyId: string,
    employeeId: string,
    filters: { category?: AbsenceCategory; status?: AbsenceStatus } = {},
  ) {
    if (!employeeId) throw new BadRequestException('employeeId es obligatorio.');
    return this.prisma.absence.findMany({
      where: {
        companyId,
        employeeId,
        ...(filters.category ? { category: filters.category } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      include: ABSENCE_INCLUDE,
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: string, companyId: string) {
    const row = await this.prisma.absence.findFirst({
      where: { id, companyId },
      include: ABSENCE_INCLUDE,
    });
    if (!row) throw new NotFoundException('Ausencia no encontrada');
    return row;
  }

  /* SOFT availability marker. NOT available iff there is an APROBADO absence with
     blocksAvailability=true whose [startDate,endDate] covers `date` (default
     today). Reads the absences table ONLY — no Operations call/mutation. */
  async getAvailability(companyId: string, employeeId: string, dateStr?: string) {
    await this.getEmployeeOrThrow(employeeId, companyId);
    const date = dateStr ? this.startOfUtcDay(new Date(dateStr)) : this.utcToday();
    const blocking = await this.prisma.absence.findFirst({
      where: {
        companyId,
        employeeId,
        status: 'APROBADO',
        blocksAvailability: true,
        startDate: { lte: date },
        endDate: { gte: date },
      },
      include: ABSENCE_INCLUDE,
      orderBy: { startDate: 'asc' },
    });
    return {
      employeeId,
      date: date.toISOString(),
      available: !blocking,
      blockingAbsence: blocking ?? null,
    };
  }

  /* Validates BOTH refs independently (no early return) so a single call passing
     absenceTypeId AND documentId always checks both — absenceType scoped to the
     company, document scoped to the company AND this employee. Returns the
     resolved type (or null) so the caller can pre-fill días/withPay defaults. */
  private async validateRefs(
    companyId: string,
    employeeId: string,
    refs: { absenceTypeId?: string | null; documentId?: string | null },
  ) {
    let type: { id: string; daysDefault: number | null; withPay: boolean } | null = null;
    if (refs.absenceTypeId) {
      type = await this.prisma.absenceType.findFirst({
        where: { id: refs.absenceTypeId, companyId },
        select: { id: true, daysDefault: true, withPay: true, category: true },
      });
      if (!type) throw new BadRequestException('El tipo de ausencia no existe en esta empresa.');
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
    return type;
  }

  async create(companyId: string, userId: string, dto: CreateAbsenceDto) {
    await this.getEmployeeOrThrow(dto.employeeId, companyId);
    const start = this.startOfUtcDay(new Date(dto.startDate));
    const end = this.startOfUtcDay(new Date(dto.endDate));
    if (end.getTime() < start.getTime()) {
      throw new BadRequestException('La fecha de término no puede ser anterior a la de inicio.');
    }

    /* Validate both refs in one call; pre-fill días/withPay from the type default
       when a type is given (permisos reference a type; licencias usually don't).
       The dto always wins. */
    const type = await this.validateRefs(companyId, dto.employeeId, {
      absenceTypeId: dto.absenceTypeId ?? null,
      documentId: dto.documentId ?? null,
    });

    const dias = dto.dias ?? type?.daysDefault ?? 0;
    const withPay = dto.withPay ?? type?.withPay ?? true;
    /* A licencia may be registered directly APROBADO; a permiso defaults to
       PENDIENTE. Only PENDIENTE/APROBADO are valid creation statuses (DTO). */
    const status: AbsenceStatus = dto.status ?? 'PENDIENTE';
    const now = new Date();

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.absence.create({
        data: {
          companyId,
          createdBy: userId,
          employeeId: dto.employeeId,
          category: dto.category,
          absenceTypeId: dto.absenceTypeId ?? null,
          startDate: start,
          endDate: end,
          dias,
          withPay,
          blocksAvailability: dto.blocksAvailability ?? true,
          status,
          medicalFolio: dto.medicalFolio ?? null,
          healthEntity: dto.healthEntity ?? null,
          notes: dto.notes ?? null,
          documentId: dto.documentId ?? null,
          requestedBy: userId,
          approvedBy: status === 'APROBADO' ? userId : null,
          approvedAt: status === 'APROBADO' ? now : null,
        },
        include: ABSENCE_INCLUDE,
      });
    });
  }

  async update(id: string, companyId: string, userId: string, dto: UpdateAbsenceDto) {
    const existing = await this.prisma.absence.findFirst({
      where: { id, companyId },
      select: { id: true, employeeId: true, status: true, startDate: true, endDate: true },
    });
    if (!existing) throw new NotFoundException('Ausencia no encontrada');
    if (existing.status === 'RECHAZADO' || existing.status === 'CANCELADO') {
      throw new BadRequestException(
        'No se puede editar una ausencia finalizada (rechazada o cancelada).',
      );
    }
    if (dto.absenceTypeId || dto.documentId) {
      await this.validateRefs(companyId, existing.employeeId, {
        absenceTypeId: dto.absenceTypeId ?? null,
        documentId: dto.documentId ?? null,
      });
    }

    const start = dto.startDate ? this.startOfUtcDay(new Date(dto.startDate)) : existing.startDate;
    const end = dto.endDate ? this.startOfUtcDay(new Date(dto.endDate)) : existing.endDate;
    if (end.getTime() < start.getTime()) {
      throw new BadRequestException('La fecha de término no puede ser anterior a la de inicio.');
    }

    const data: Prisma.AbsenceUncheckedUpdateInput = { updatedBy: userId };
    if (dto.absenceTypeId !== undefined) data.absenceTypeId = dto.absenceTypeId || null;
    if (dto.startDate !== undefined) data.startDate = start;
    if (dto.endDate !== undefined) data.endDate = end;
    if (dto.dias !== undefined) data.dias = dto.dias;
    if (dto.withPay !== undefined) data.withPay = dto.withPay;
    if (dto.blocksAvailability !== undefined) data.blocksAvailability = dto.blocksAvailability;
    if (dto.medicalFolio !== undefined) data.medicalFolio = dto.medicalFolio || null;
    if (dto.healthEntity !== undefined) data.healthEntity = dto.healthEntity || null;
    if (dto.documentId !== undefined) data.documentId = dto.documentId || null;
    if (dto.notes !== undefined) data.notes = dto.notes || null;

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.absence.update({ where: { id }, data, include: ABSENCE_INCLUDE });
    });
  }

  async approve(id: string, companyId: string, userId: string) {
    const existing = await this.findOne(id, companyId);
    if (existing.status !== 'PENDIENTE') {
      throw new BadRequestException('Sólo se pueden aprobar ausencias PENDIENTES.');
    }
    const now = new Date();
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.absence.update({
        where: { id },
        data: {
          status: 'APROBADO',
          approvedBy: userId,
          approvedAt: now,
          rejectionReason: null,
          updatedBy: userId,
        },
        include: ABSENCE_INCLUDE,
      });
    });
  }

  async reject(id: string, companyId: string, userId: string, dto: RejectAbsenceDto) {
    const existing = await this.findOne(id, companyId);
    if (existing.status !== 'PENDIENTE') {
      throw new BadRequestException('Sólo se pueden rechazar ausencias PENDIENTES.');
    }
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.absence.update({
        where: { id },
        data: { status: 'RECHAZADO', rejectionReason: dto.reason, updatedBy: userId },
        include: ABSENCE_INCLUDE,
      });
    });
  }

  /* Cancel frees availability — a CANCELADO row no longer counts in
     getAvailability (which only considers APROBADO). Allowed from PENDIENTE or
     APROBADO. */
  async cancel(id: string, companyId: string, userId: string) {
    const existing = await this.findOne(id, companyId);
    if (existing.status !== 'PENDIENTE' && existing.status !== 'APROBADO') {
      throw new BadRequestException('Sólo se pueden cancelar ausencias PENDIENTES o APROBADAS.');
    }
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.absence.update({
        where: { id },
        data: { status: 'CANCELADO', updatedBy: userId },
        include: ABSENCE_INCLUDE,
      });
    });
  }
}
