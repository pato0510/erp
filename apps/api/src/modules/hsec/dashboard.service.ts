import { Injectable } from '@nestjs/common';
import { HsecIncidentSeverity, HsecIncidentStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

/* CAL-008b doctrine (the incidents-service copy): the dashboard's "current month" is the
   CHILEAN calendar month — never the UTC one, which rolls over early in the Chilean evening
   on every month's last day. Chilean-platform constant; per-company tz is a recorded V2
   seed. */
function todayInSantiago(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/* HSEC-010 — the dashboard aggregate. EVERY number is DERIVED LIVE at read time from the
 * base tables — ZERO stored rollups, ZERO cron, ZERO BullMQ (the platform derived-never-
 * stored doctrine; the CAL-013 gestión-dashboard precedent). The month window is
 * [first day, first day of next month) of the CHILEAN current month, applied to the @db.Date
 * columns (occurredDate / date) with UTC date arithmetic (HR-004b — the stored values are
 * UTC midnights, so the UTC-constructed bounds slice exact calendar days; only "which month
 * is it" consults Santiago). */
@Injectable()
export class HsecDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(companyId: string) {
    const month = todayInSantiago().slice(0, 7); // 'YYYY-MM' — the Chilean month
    const y = Number(month.slice(0, 4));
    const m = Number(month.slice(5, 7));
    const monthStart = new Date(Date.UTC(y, m - 1, 1));
    const nextMonthStart = new Date(Date.UTC(y, m, 1));
    const window = { gte: monthStart, lt: nextMonthStart };

    const [bySeverity, byStatus, incidentsTotal, trainingsTotal, deliveriesTotal] =
      await Promise.all([
        this.prisma.hsecIncident.groupBy({
          by: ['severity'],
          where: { companyId, occurredDate: window },
          _count: { _all: true },
        }),
        this.prisma.hsecIncident.groupBy({
          by: ['status'],
          where: { companyId, occurredDate: window },
          _count: { _all: true },
        }),
        this.prisma.hsecIncident.count({ where: { companyId, occurredDate: window } }),
        this.prisma.hsecTraining.count({ where: { companyId, date: window } }),
        this.prisma.hsecEppDelivery.count({ where: { companyId, date: window } }),
      ]);

    const sev = Object.fromEntries(
      Object.values(HsecIncidentSeverity).map((s) => [
        s,
        bySeverity.find((r) => r.severity === s)?._count._all ?? 0,
      ]),
    );
    const st = Object.fromEntries(
      Object.values(HsecIncidentStatus).map((s) => [
        s,
        byStatus.find((r) => r.status === s)?._count._all ?? 0,
      ]),
    );

    return {
      month,
      incidents: { total: incidentsTotal, bySeverity: sev, byStatus: st },
      trainings: { total: trainingsTotal },
      eppDeliveries: { total: deliveriesTotal },
    };
  }
}
