import { Injectable } from '@nestjs/common';
import { AbsenceStatus, EmployeeStatus, VacationRequestStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/* CAL-018 — the narrowed contract for the master calendar's `ausencias` collection (the signed
 * exposure matrix, 2026-07-23 — the HARDEST line). STRUCTURALLY minimal: employeeId + fullName +
 * range. NOTHING else — no category, no medicalFolio, no healthEntity, no absence type/motivo, no
 * status. "No disponible" is a UI CONSTANT, not a payload field: the shape has no reason-shaped
 * slot to leak health PII into (the CAL-006 discipline — BirthdayEntry cannot carry a year;
 * AusenciaCalendarEntry cannot carry a motivo). */

export interface AusenciaCalendarEntry {
  employeeId: string; // stable render key + the id the ability-shaped link resolves
  fullName: string;
  startDate: string; // ISO of the @db.Date (UTC midnight)
  endDate: string; // ISO of the @db.Date (UTC midnight)
  // NO category. NO medicalFolio. NO healthEntity. NO type/motivo. NO status. The absence is the guarantee.
}

@Injectable()
export class RrhhAbsenceReadService {
  constructor(private readonly prisma: PrismaService) {}

  /** CAL-018 — the "not available" windows intersecting [start, end], for ACTIVE employees only.
   *  THE SET RULE replicates DisponibilidadService.loadCoveringMaps
   *  (rrhh/disponibilidad/disponibilidad.service.ts:79-124) — the SAME covering-record predicates
   *  that make someone NO_DISPONIBLE / VACACIONES on the availability board:
   *    - blocking Absence   (lines 90-105): status APROBADO AND blocksAvailability = true
   *    - Vacation           (lines 109-118): status IN (APROBADO, TOMADO)
   *  Disponibilidad tests a SINGLE date (startDate <= date AND endDate >= date); this leaf feeds a
   *  RANGE, so the date predicate is generalized point→interval (startDate <= end AND endDate >=
   *  start) — the set-DEFINING conditions (statuses, the blocksAvailability flag) are byte-for-byte
   *  identical; only the temporal bound widens, the same generalization every calendar leaf uses.
   *  ACTIVO-only: Disponibilidad's board resolves solely `status: 'ACTIVO'` employees
   *  (disponibilidad.service.ts:139) — an inactive employee has no availability to block — so this
   *  leaf filters `employee.status = ACTIVO` (a blocking record on an INACTIVO/DESVINCULADO
   *  employee never surfaces).
   *
   *  DIFFERENCE FROM THE TICKET'S EXPECTED SHAPE (followed per instruction): the expected shape
   *  named only `blocksAvailability = true` for absences; Disponibilidad ALSO requires the absence
   *  to be `status: 'APROBADO'` (line 93). Following Disponibilidad, this leaf requires BOTH — a
   *  PENDIENTE blocking absence does NOT count. */
  async listAusenciasForRange(
    companyId: string,
    start: Date,
    end: Date,
  ): Promise<AusenciaCalendarEntry[]> {
    // Both queries: the covering predicate + interval overlap + ACTIVO employee, selecting ONLY the
    // four contract fields (fullName via the employee relation). No toxic column is ever read.
    const [absences, vacations] = await Promise.all([
      this.prisma.absence.findMany({
        where: {
          companyId,
          status: AbsenceStatus.APROBADO,
          blocksAvailability: true,
          startDate: { lte: end },
          endDate: { gte: start },
          employee: { status: EmployeeStatus.ACTIVO },
        },
        select: {
          employeeId: true,
          startDate: true,
          endDate: true,
          employee: { select: { fullName: true } },
        },
      }),
      this.prisma.vacationRequest.findMany({
        where: {
          companyId,
          status: { in: [VacationRequestStatus.APROBADO, VacationRequestStatus.TOMADO] },
          startDate: { lte: end },
          endDate: { gte: start },
          employee: { status: EmployeeStatus.ACTIVO },
        },
        select: {
          employeeId: true,
          startDate: true,
          endDate: true,
          employee: { select: { fullName: true } },
        },
      }),
    ]);

    // Each covering record is one "no disponible" window (an employee with both a vacation and a
    // blocking absence yields two entries — distinct ranges). Narrowed to the four-key shape.
    return [...absences, ...vacations].map((r) => ({
      employeeId: r.employeeId,
      fullName: r.employee.fullName,
      startDate: r.startDate.toISOString(),
      endDate: r.endDate.toISOString(),
    }));
  }
}
