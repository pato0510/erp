import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { CertificationsService } from '../certifications/certifications.service';

/* HR-015 — tablero de disponibilidad. READ-ONLY team-level board that CONSOLIDATES
   existing data: availability for a date (reusing the HR-012 blocking-absence
   marker + the HR-011 approved-vacation check), the certification matriz (reusing
   the HR-014 CertificationsService.compliance per employee), and a consolidated
   alerts view (mirroring the HR-014/HR-007 cron SELECTION as a read view — it does
   NOT run or duplicate the cron). NO writes, NO salary/compensation data anywhere.
   The 30-day window mirrors the reminder services.

   HR-016 — the for-service availability methods (forServiceSingle/Batch/Disponibles)
   share the SAME resolution (resolveState + loadCoveringMaps) so the cross-module
   contract can never drift from the human-facing board. */
const ALERT_WINDOW_DAYS = 30;
/* HR-016 — sensible cap on the batch roster size (DoS guard for a public-ish
   contract endpoint). */
const MAX_BATCH = 100;

export type AvailabilityState = 'DISPONIBLE' | 'NO_DISPONIBLE' | 'VACACIONES';

interface CoveringVacation {
  endDate: Date;
}
interface CoveringAbsence {
  category: string;
  endDate: Date;
  absenceType: { name: string } | null;
}
interface ResolvedAvailability {
  state: AvailabilityState;
  reason: string | null;
  until: Date | null;
}

@Injectable()
export class DisponibilidadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
    private readonly certifications: CertificationsService,
  ) {}

  private startOfUtcDay(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  private utcToday(): Date {
    return this.startOfUtcDay(new Date());
  }
  private resolveDate(dateStr?: string): Date {
    return dateStr ? this.startOfUtcDay(new Date(dateStr)) : this.utcToday();
  }

  /* THE canonical per-employee resolution. Precedence VACACIONES > NO_DISPONIBLE >
     DISPONIBLE — shared by the HR-015 board AND the HR-016 for-service endpoints so
     they can never diverge. */
  private resolveState(
    vac: CoveringVacation | undefined,
    abs: CoveringAbsence | undefined,
  ): ResolvedAvailability {
    if (vac) return { state: 'VACACIONES', reason: 'Vacaciones', until: vac.endDate };
    if (abs) {
      return {
        state: 'NO_DISPONIBLE',
        reason:
          abs.absenceType?.name ?? (abs.category === 'LICENCIA' ? 'Licencia médica' : 'Permiso'),
        until: abs.endDate,
      };
    }
    return { state: 'DISPONIBLE', reason: null, until: null };
  }

  /* THE canonical covering-record queries: the HR-012 blocking-absence predicate +
     the HR-011 {APROBADO,TOMADO} vacation predicate, both filtered to a date and
     (optionally) a set of employees. Batched — never N+1. */
  private async loadCoveringMaps(
    tx: Prisma.TransactionClient,
    companyId: string,
    date: Date,
    employeeIds?: string[],
  ): Promise<{
    absenceByEmp: Map<string, CoveringAbsence>;
    vacationByEmp: Map<string, CoveringVacation>;
  }> {
    const empFilter = employeeIds ? { employeeId: { in: employeeIds } } : {};

    const blockingAbsences = await tx.absence.findMany({
      where: {
        companyId,
        status: 'APROBADO',
        blocksAvailability: true,
        startDate: { lte: date },
        endDate: { gte: date },
        ...empFilter,
      },
      select: {
        employeeId: true,
        category: true,
        endDate: true,
        absenceType: { select: { name: true } },
      },
    });

    /* APROBADO AND TOMADO are the consumed-time set (HR-011 computeBalance counts
       both), so an in-progress vacation already marked TOMADO still shows VACACIONES. */
    const vacations = await tx.vacationRequest.findMany({
      where: {
        companyId,
        status: { in: ['APROBADO', 'TOMADO'] },
        startDate: { lte: date },
        endDate: { gte: date },
        ...empFilter,
      },
      select: { employeeId: true, endDate: true },
    });

    return {
      absenceByEmp: new Map(blockingAbsences.map((a) => [a.employeeId, a])),
      vacationByEmp: new Map(vacations.map((v) => [v.employeeId, v])),
    };
  }

  /* Team availability for a date. For each ACTIVE employee:
     - VACACIONES   if an APROBADO vacation request covers the date (HR-011)
     - NO_DISPONIBLE if an APROBADO absence with blocksAvailability=true covers it
       (HR-012) — with the licencia/permiso reason
     - DISPONIBLE   otherwise
     Precedence VACACIONES > NO_DISPONIBLE (a vacation is the headline reason).
     Two batched queries instead of N per-employee calls; the predicates are the
     SAME ones HR-011/HR-012 use. */
  async getAvailability(companyId: string, userId: string, dateStr?: string) {
    const date = this.resolveDate(dateStr);

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const employees = await tx.employee.findMany({
        where: { companyId, status: 'ACTIVO' },
        select: {
          id: true,
          fullName: true,
          area: true,
          jobPosition: { select: { id: true, name: true } },
        },
        orderBy: [{ area: 'asc' }, { fullName: 'asc' }],
      });

      const { absenceByEmp, vacationByEmp } = await this.loadCoveringMaps(tx, companyId, date);

      const rows = employees.map((e) => {
        const r = this.resolveState(vacationByEmp.get(e.id), absenceByEmp.get(e.id));
        return {
          employeeId: e.id,
          fullName: e.fullName,
          cargo: e.jobPosition?.name ?? null,
          area: e.area,
          state: r.state,
          reason: r.reason,
          until: r.until,
        };
      });

      const summary = {
        total: rows.length,
        disponibles: rows.filter((r) => r.state === 'DISPONIBLE').length,
        noDisponibles: rows.filter((r) => r.state === 'NO_DISPONIBLE').length,
        vacaciones: rows.filter((r) => r.state === 'VACACIONES').length,
      };
      return { date: date.toISOString(), summary, employees: rows };
    });
  }

  /* ───────────────────────── HR-016 — for-service contract ─────────────────────
     The STABLE, documented availability contract other modules (Operations,
     later Comercial) ASK. RRHH EXPOSES it and stays decoupled — it does NOT know
     about or call Operations. DISPONIBILIDAD ONLY (vacation/leave/permit); the
     faena-based habilitación (faena entity + per-faena required-document dossier)
     is a V2 extension. Every method is READ-ONLY and reuses resolveState +
     loadCoveringMaps — the EXACT HR-015 resolution, never a copy. No salary data.

     Response shape (single & each batch item):
       { employeeId, fullName, date, available, state, reason, until }
       state:  'DISPONIBLE' | 'VACACIONES' | 'NO_DISPONIBLE'
       available === (state === 'DISPONIBLE')
       reason:  human label of the blocking record (or null when DISPONIBLE)
       until:   the date the block ends (or null when DISPONIBLE) */

  private toForServiceItem(
    emp: { id: string; fullName: string },
    date: Date,
    resolved: ResolvedAvailability,
  ) {
    return {
      employeeId: emp.id,
      fullName: emp.fullName,
      date: date.toISOString(),
      available: resolved.state === 'DISPONIBLE',
      state: resolved.state,
      reason: resolved.reason,
      until: resolved.until,
    };
  }

  /* Single employee. 404 if the id is not an employee of this company. */
  async forServiceSingle(companyId: string, userId: string, employeeId: string, dateStr?: string) {
    const date = this.resolveDate(dateStr);
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const emp = await tx.employee.findFirst({
        where: { id: employeeId, companyId },
        select: { id: true, fullName: true },
      });
      if (!emp) throw new NotFoundException('Trabajador no encontrado');
      const { absenceByEmp, vacationByEmp } = await this.loadCoveringMaps(tx, companyId, date, [
        employeeId,
      ]);
      return this.toForServiceItem(
        emp,
        date,
        this.resolveState(vacationByEmp.get(employeeId), absenceByEmp.get(employeeId)),
      );
    });
  }

  /* Batch roster. Caps at MAX_BATCH, silently ignores ids not in the company.
     Two batched queries for the whole roster — never N+1. */
  async forServiceBatch(companyId: string, userId: string, rawIds: string[], dateStr?: string) {
    const ids = Array.from(new Set(rawIds.map((s) => s.trim()).filter(Boolean)));
    if (ids.length === 0) throw new BadRequestException('employeeIds requerido');
    if (ids.length > MAX_BATCH) {
      throw new BadRequestException(`Máximo ${MAX_BATCH} trabajadores por consulta`);
    }
    const date = this.resolveDate(dateStr);
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const emps = await tx.employee.findMany({
        where: { id: { in: ids }, companyId },
        select: { id: true, fullName: true },
        orderBy: { fullName: 'asc' },
      });
      const foundIds = emps.map((e) => e.id);
      const { absenceByEmp, vacationByEmp } = await this.loadCoveringMaps(
        tx,
        companyId,
        date,
        foundIds,
      );
      const items = emps.map((emp) =>
        this.toForServiceItem(
          emp,
          date,
          this.resolveState(vacationByEmp.get(emp.id), absenceByEmp.get(emp.id)),
        ),
      );
      return {
        date: date.toISOString(),
        requested: ids.length,
        count: items.length,
        items,
      };
    });
  }

  /* Convenience: the ACTIVE employees who are DISPONIBLE on the date (id + name +
     cargo) — "who can I assign". Read-only. */
  async forServiceDisponibles(companyId: string, userId: string, dateStr?: string) {
    const date = this.resolveDate(dateStr);
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const employees = await tx.employee.findMany({
        where: { companyId, status: 'ACTIVO' },
        select: { id: true, fullName: true, jobPosition: { select: { name: true } } },
        orderBy: [{ area: 'asc' }, { fullName: 'asc' }],
      });
      const { absenceByEmp, vacationByEmp } = await this.loadCoveringMaps(tx, companyId, date);
      const disponibles = employees
        .filter(
          (e) =>
            this.resolveState(vacationByEmp.get(e.id), absenceByEmp.get(e.id)).state ===
            'DISPONIBLE',
        )
        .map((e) => ({
          employeeId: e.id,
          fullName: e.fullName,
          cargo: e.jobPosition?.name ?? null,
        }));
      return { date: date.toISOString(), count: disponibles.length, employees: disponibles };
    });
  }

  /* Certification matriz — reuses the HR-014 compliance algorithm per ACTIVE
     employee (the piece deferred from HR-014). Returns a row per employee with the
     cargo's required cert types and their compliance state; the frontend builds
     the column grid from the union of cert-type names. No salary data. */
  async getMatriz(companyId: string, userId: string) {
    const employees = await this.rlsService.executeWithRls(companyId, userId, async (tx) =>
      tx.employee.findMany({
        where: { companyId, status: 'ACTIVO' },
        select: { id: true, fullName: true, area: true, jobPosition: { select: { name: true } } },
        orderBy: [{ area: 'asc' }, { fullName: 'asc' }],
      }),
    );

    const rows = [];
    for (const e of employees) {
      const comp = await this.certifications.compliance(companyId, e.id);
      rows.push({
        employeeId: e.id,
        fullName: e.fullName,
        cargo: e.jobPosition?.name ?? null,
        area: e.area,
        compliancePercentage: comp.compliance.compliancePercentage,
        totalRequired: comp.compliance.totalRequired,
        cells: comp.requiredCerts.map((r) => ({
          certTypeName: r.certTypeName,
          status: r.derivedStatus,
        })),
      });
    }

    /* Union of required cert-type names → column headers. */
    const columns = Array.from(
      new Set(rows.flatMap((r) => r.cells.map((c) => c.certTypeName))),
    ).sort();
    return { columns, rows, generatedAt: new Date().toISOString() };
  }

  /* Consolidated team alerts — a READ VIEW mirroring the daily reminder cron
     SELECTION (it does NOT run the cron): certifications POR_VENCER/VENCIDA and
     fixed-term contracts por vencer/vencidos within the 30-day window. */
  async getAlertas(companyId: string, userId: string) {
    const today = this.utcToday();
    const horizon = new Date(today);
    horizon.setUTCDate(horizon.getUTCDate() + ALERT_WINDOW_DAYS);
    const days = (d: Date) =>
      Math.floor((this.startOfUtcDay(d).getTime() - today.getTime()) / 86400000);

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      /* HR-014 reminder selection — VIGENTE certs with an expiry within/past window. */
      const certRows = await tx.certification.findMany({
        where: { companyId, status: 'VIGENTE', expiryDate: { not: null, lte: horizon } },
        select: {
          id: true,
          expiryDate: true,
          employee: { select: { id: true, fullName: true } },
          certificationType: { select: { name: true } },
        },
        orderBy: { expiryDate: 'asc' },
      });
      const certifications = certRows.map((c) => {
        const d = days(c.expiryDate as Date);
        return {
          certificationId: c.id,
          employeeId: c.employee.id,
          employeeName: c.employee.fullName,
          certTypeName: c.certificationType.name,
          expiryDate: c.expiryDate,
          daysUntil: d,
          state: d < 0 ? 'VENCIDA' : 'POR_VENCER',
        };
      });

      /* ContractRemindersService selection — principal fixed-term VIGENTE contracts
         with endDate within/past window. */
      const contractRows = await tx.employeeContract.findMany({
        where: {
          companyId,
          status: 'VIGENTE',
          contractType: { in: ['PLAZO_FIJO', 'POR_OBRA'] },
          parentContractId: null,
          endDate: { not: null, lte: horizon },
        },
        select: {
          id: true,
          endDate: true,
          contractType: true,
          employee: { select: { id: true, fullName: true } },
        },
        orderBy: { endDate: 'asc' },
      });
      const contracts = contractRows.map((c) => {
        const d = days(c.endDate as Date);
        return {
          contractId: c.id,
          employeeId: c.employee.id,
          employeeName: c.employee.fullName,
          contractType: c.contractType,
          endDate: c.endDate,
          daysUntil: d,
          state: d < 0 ? 'VENCIDO' : 'POR_VENCER',
        };
      });

      return {
        alertWindowDays: ALERT_WINDOW_DAYS,
        certifications,
        contracts,
        generatedAt: new Date().toISOString(),
      };
    });
  }
}
