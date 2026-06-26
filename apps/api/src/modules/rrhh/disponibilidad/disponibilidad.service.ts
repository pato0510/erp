import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { CertificationsService } from '../certifications/certifications.service';

/* HR-015 — tablero de disponibilidad. READ-ONLY team-level board that CONSOLIDATES
   existing data: availability for a date (reusing the HR-012 blocking-absence
   marker + the HR-011 approved-vacation check), the certification matriz (reusing
   the HR-014 CertificationsService.compliance per employee), and a consolidated
   alerts view (mirroring the HR-014/HR-007 cron SELECTION as a read view — it does
   NOT run or duplicate the cron). NO writes, NO salary/compensation data anywhere.
   The 30-day window mirrors the reminder services. */
const ALERT_WINDOW_DAYS = 30;

export type AvailabilityState = 'DISPONIBLE' | 'NO_DISPONIBLE' | 'VACACIONES';

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

  /* Team availability for a date. For each ACTIVE employee:
     - VACACIONES   if an APROBADO vacation request covers the date (HR-011)
     - NO_DISPONIBLE if an APROBADO absence with blocksAvailability=true covers it
       (HR-012) — with the licencia/permiso reason
     - DISPONIBLE   otherwise
     Precedence VACACIONES > NO_DISPONIBLE (a vacation is the headline reason).
     Two batched queries instead of N per-employee calls; the predicates are the
     SAME ones HR-011/HR-012 use. */
  async getAvailability(companyId: string, userId: string, dateStr?: string) {
    const date = dateStr ? this.startOfUtcDay(new Date(dateStr)) : this.utcToday();

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

      /* HR-012 marker predicate — APROBADO blocking absence covering the date. */
      const blockingAbsences = await tx.absence.findMany({
        where: {
          companyId,
          status: 'APROBADO',
          blocksAvailability: true,
          startDate: { lte: date },
          endDate: { gte: date },
        },
        select: {
          employeeId: true,
          category: true,
          endDate: true,
          absenceType: { select: { name: true } },
        },
      });

      /* HR-011 approved-request check — a vacation covering the date. APROBADO AND
         TOMADO are the consumed-time set (computeBalance counts both), so an
         in-progress vacation already marked TOMADO still shows as VACACIONES. */
      const vacations = await tx.vacationRequest.findMany({
        where: {
          companyId,
          status: { in: ['APROBADO', 'TOMADO'] },
          startDate: { lte: date },
          endDate: { gte: date },
        },
        select: { employeeId: true, endDate: true },
      });

      const absenceByEmp = new Map(blockingAbsences.map((a) => [a.employeeId, a]));
      const vacationByEmp = new Map(vacations.map((v) => [v.employeeId, v]));

      const rows = employees.map((e) => {
        const vac = vacationByEmp.get(e.id);
        const abs = absenceByEmp.get(e.id);
        let state: AvailabilityState = 'DISPONIBLE';
        let reason: string | null = null;
        let until: Date | null = null;
        if (vac) {
          state = 'VACACIONES';
          reason = 'Vacaciones';
          until = vac.endDate;
        } else if (abs) {
          state = 'NO_DISPONIBLE';
          reason =
            abs.absenceType?.name ?? (abs.category === 'LICENCIA' ? 'Licencia médica' : 'Permiso');
          until = abs.endDate;
        }
        return {
          employeeId: e.id,
          fullName: e.fullName,
          cargo: e.jobPosition?.name ?? null,
          area: e.area,
          state,
          reason,
          until,
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
