import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';

/* The "por vencer" window — mirrors the HR-004a DEFAULT_ALERT_DAYS_BEFORE so the
   dashboard's document buckets line up with the per-employee compliance view. */
const ALERT_WINDOW_DAYS = 30;
const RECENT_LIMIT = 6;
const EXPIRY_ALERT_LIMIT = 8;

/* Per-caller ability flags used to SHAPE the /overview payload (never to grant
   access — the endpoint gate stays `read Employee`). Computed at the controller
   from the CASL ability PoliciesGuard built, so shaping tracks the ability
   factory automatically (no role-string checks anywhere). */
export interface OverviewScope {
  canReadDocuments: boolean;
  canReadContracts: boolean;
}

interface ContractRenewalBlock {
  available: boolean;
  proximasRenovaciones: unknown[];
}

/* Pure scoping of the two CROSS-DOMAIN sections of /overview:
   - alertasVencimiento: per-person document-expiry rows (employee + document-type
     names) → only a Documentos reader receives them; others get []. NOTE the
     aggregate document COUNTS are NOT here — they live in the untouched
     `documentos` block and remain visible (aggregate-appropriate).
   - contratos: the contract-renewal block → only a Contratos reader may receive
     populated renewals; others get the empty/unavailable block. Empty today, but
     the gate is wired for when contract-renewal data goes live.
   Kept pure so it is trivially unit-testable, and byte-identical for callers that
   can read both domains. */
export function scopeOverviewSections<A>(
  raw: { alertasVencimiento: A[]; contratos: ContractRenewalBlock },
  scope: OverviewScope,
): { alertasVencimiento: A[]; contratos: ContractRenewalBlock } {
  return {
    alertasVencimiento: scope.canReadDocuments ? raw.alertasVencimiento : [],
    contratos: scope.canReadContracts
      ? raw.contratos
      : { available: false, proximasRenovaciones: [] },
  };
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  private utcToday(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  /* Module overview — dotación + documents + honest placeholders. Gated at the
     controller on `read Employee` (MANAGER/ADMIN/SUPER_ADMIN). All reads run
     inside executeWithRls so the company RLS context is set (defense-in-depth)
     and every query also carries an explicit companyId filter. Queries run
     sequentially because they share one interactive-transaction connection. */
  async getOverview(companyId: string, userId: string, scope: OverviewScope) {
    const today = this.utcToday();
    const horizon = new Date(today);
    horizon.setUTCDate(horizon.getUTCDate() + ALERT_WINDOW_DAYS);

    /* APPROVED + non-superseded is the compliance-relevant set (this inherently
       EXCLUDES REPLACED, whose supersededById is set). */
    const approvedCurrent: Prisma.EmployeeDocumentWhereInput = {
      companyId,
      status: 'APPROVED',
      supersededById: null,
    };

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const activos = await tx.employee.count({ where: { companyId, status: 'ACTIVO' } });
      const total = await tx.employee.count({ where: { companyId } });

      const porAreaRaw = await tx.employee.groupBy({
        by: ['area'],
        where: { companyId, status: 'ACTIVO' },
        _count: { _all: true },
      });
      const porEstadoRaw = await tx.employee.groupBy({
        by: ['status'],
        where: { companyId },
        _count: { _all: true },
      });

      const documentosVencidos = await tx.employeeDocument.count({
        where: { ...approvedCurrent, expiryDate: { lt: today } },
      });
      const documentosPorVencer = await tx.employeeDocument.count({
        where: { ...approvedCurrent, expiryDate: { gte: today, lte: horizon } },
      });
      const documentosAlDia = await tx.employeeDocument.count({
        where: {
          ...approvedCurrent,
          OR: [{ expiryDate: null }, { expiryDate: { gt: horizon } }],
        },
      });
      const documentosPendientes = await tx.employeeDocument.count({
        where: { companyId, status: 'PENDING_REVIEW' },
      });

      const recientes = await tx.employee.findMany({
        where: { companyId },
        select: {
          id: true,
          fullName: true,
          area: true,
          status: true,
          jobPosition: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: RECENT_LIMIT,
      });

      /* Expiry-alert center: the soonest-expiring (and already-overdue) current
         documents, with the employee + type for a deep link. No salary data. */
      const expiringRaw = await tx.employeeDocument.findMany({
        where: { ...approvedCurrent, expiryDate: { not: null, lte: horizon } },
        select: {
          id: true,
          expiryDate: true,
          employee: { select: { id: true, fullName: true } },
          documentType: { select: { id: true, name: true } },
        },
        orderBy: { expiryDate: 'asc' },
        take: EXPIRY_ALERT_LIMIT,
      });

      const alertasVencimiento = expiringRaw.map((d) => {
        const exp = d.expiryDate as Date;
        const daysUntil = Math.floor((exp.getTime() - today.getTime()) / 86400000);
        return {
          documentId: d.id,
          employeeId: d.employee.id,
          employeeName: d.employee.fullName,
          documentTypeName: d.documentType.name,
          expiryDate: exp,
          daysUntil,
          state: daysUntil < 0 ? 'VENCIDO' : 'POR_VENCER',
        };
      });

      /* Per-caller scoping: alertasVencimiento (per-person document rows) and the
         contract-renewal block are cross-domain data. A caller that cannot read
         those domains receives the EMPTY shape; the aggregate document COUNTS in
         `documentos` below stay untouched. scopeOverviewSections is pure + tested. */
      const sections = scopeOverviewSections(
        {
          alertasVencimiento,
          /* Honest placeholder — this dataset doesn't exist yet. The frontend
             renders "disponible próximamente", never a fabricated number. */
          contratos: { available: false, proximasRenovaciones: [] as unknown[] },
        },
        scope,
      );

      return {
        dotacion: {
          activos,
          total,
          porArea: porAreaRaw
            .map((r) => ({ area: r.area, count: r._count._all }))
            .sort((a, b) => b.count - a.count),
          porEstado: porEstadoRaw.map((r) => ({ status: r.status, count: r._count._all })),
        },
        documentos: {
          vencidos: documentosVencidos,
          porVencer: documentosPorVencer,
          alDia: documentosAlDia,
          pendientesRevision: documentosPendientes,
          alertWindowDays: ALERT_WINDOW_DAYS,
        },
        alertasVencimiento: sections.alertasVencimiento,
        recientes,
        contratos: sections.contratos,
        generatedAt: new Date().toISOString(),
      };
    });
  }

  /* Masa salarial — the GUARDED aggregate. Gated at the controller on
     `read EmployeeCompensation`, so it reaches MANAGER/ADMIN/SUPER_ADMIN AND
     ACCOUNTANT, but NOT VIEWER/ANALYST. Returns ONLY the company-wide sum and
     counts — never any per-person compensation row. */
  async getPayroll(companyId: string, userId: string) {
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const agg = await tx.employeeCompensation.aggregate({
        where: { companyId },
        _sum: { baseSalaryGross: true },
        _count: { _all: true },
      });
      const employeesActive = await tx.employee.count({
        where: { companyId, status: 'ACTIVO' },
      });
      const employeesTotal = await tx.employee.count({ where: { companyId } });

      return {
        /* Decimal from Prisma arrives as a string-like — Number() it once here. */
        grossMonthly: Number(agg._sum.baseSalaryGross ?? 0),
        employeesWithCompensation: agg._count._all,
        employeesActive,
        employeesTotal,
        currency: 'CLP',
        /* Net requires the payroll engine (libro de remuneraciones), which is a
           later RRHH ticket — we don't fabricate it. */
        netMonthly: null as number | null,
      };
    });
  }
}
