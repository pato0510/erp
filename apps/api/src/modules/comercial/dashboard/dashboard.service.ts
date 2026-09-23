import { BadRequestException, Injectable } from '@nestjs/common';
import { OpportunityStage, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ACTIVITY_TYPE_LABELS } from '../activities/system-activity';
import { LOST_REASON_LABELS } from '../opportunities/opportunity-labels';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

/* COM-019 — the Comercial dashboard (CRM-4): win rate, KPIs, pipeline by stage, lost
 * reasons, lost and top accounts, activities by type. EVERYTHING is DERIVED LIVE from
 * opportunities / accounts / activities for the requested range — no stored aggregate,
 * no cache, no cron (the platform doctrine). Definitions, in terms of the real fields:
 *   deal value   = Opportunity.estimatedValue (what the board sums; the accepted quote's
 *                  netAmount only feeds the handoff Commitment, not the CRM figures);
 *   closing date = Opportunity.closedAt (set on GANADA/PERDIDA, cleared on reopen);
 *   won/lost in range = stage GANADA/PERDIDA AND closedAt within [from, to] (to inclusive);
 *   open         = every stage except GANADA/PERDIDA (EN_PAUSA counts as open);
 *   lost reason  = Opportunity.lostReason (enum; kept as history on reopen).
 * ONE round of queries (Promise.all), every one carrying the explicit companyId; the
 * cross-set rules (lostAccounts, topAccounts) are folded in memory from small selects
 * because Prisma groupBy cannot express "lost-in-range AND no won-in-range AND no open". */

const DEFAULT_RANGE_DAYS = 90;
const MAX_RANGE_DAYS = 3 * 365;
const DAY_MS = 24 * 60 * 60 * 1000;

/* Pipeline order for the open snapshot — STAGE_ORDER (web stageLabels) minus the closed
   pair. Labels are the UI's; the API sends both so the chart never re-maps. */
export const PIPELINE_STAGES: { stage: OpportunityStage; label: string }[] = [
  { stage: OpportunityStage.PROSPECTO, label: 'Prospecto' },
  { stage: OpportunityStage.CONTACTO, label: 'Contacto' },
  { stage: OpportunityStage.VISITA_TECNICA, label: 'Visita Técnica' },
  { stage: OpportunityStage.COTIZACION, label: 'Cotización' },
  { stage: OpportunityStage.NEGOCIACION, label: 'Negociación' },
  { stage: OpportunityStage.EN_PAUSA, label: 'En Pausa' },
];
const OPEN_STAGES = PIPELINE_STAGES.map((s) => s.stage);

export interface DashboardRange {
  from: string;
  to: string;
  start: Date;
  end: Date;
}

const toInt = (value: Prisma.Decimal | number | string | null | undefined): number =>
  value == null ? 0 : Math.round(Number(value));

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /** Inclusive [from, to] as UTC day bounds (the HR-004b convention: dates are UTC
   * midnight). Defaults to the last 90 days ending today. 400 when from > to or the
   * range exceeds 3 years. */
  parseRange(query: DashboardQueryDto): DashboardRange {
    const todayIso = new Date().toISOString().slice(0, 10);
    const to = query.to ?? todayIso;
    const from =
      query.from ??
      new Date(Date.parse(`${to}T00:00:00.000Z`) - (DEFAULT_RANGE_DAYS - 1) * DAY_MS)
        .toISOString()
        .slice(0, 10);
    const start = new Date(`${from}T00:00:00.000Z`);
    const end = new Date(`${to}T23:59:59.999Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Fecha inválida; usa el formato YYYY-MM-DD.');
    }
    if (start.getTime() > end.getTime()) {
      throw new BadRequestException('La fecha de inicio no puede ser posterior a la de término.');
    }
    if (end.getTime() - start.getTime() > MAX_RANGE_DAYS * DAY_MS) {
      throw new BadRequestException('El rango no puede superar los 3 años.');
    }
    return { from, to, start, end };
  }

  async getDashboard(companyId: string, query: DashboardQueryDto) {
    const range = this.parseRange(query);
    const inRange = { gte: range.start, lte: range.end };

    const [created, wonRows, lostRows, openRows, activityGroups] = await Promise.all([
      this.prisma.opportunity.count({ where: { companyId, createdAt: inRange } }),
      this.prisma.opportunity.findMany({
        where: { companyId, stage: OpportunityStage.GANADA, closedAt: inRange },
        select: {
          id: true,
          accountId: true,
          estimatedValue: true,
          createdAt: true,
          closedAt: true,
          account: { select: { name: true } },
        },
      }),
      this.prisma.opportunity.findMany({
        where: { companyId, stage: OpportunityStage.PERDIDA, closedAt: inRange },
        select: {
          id: true,
          accountId: true,
          estimatedValue: true,
          closedAt: true,
          lostReason: true,
          account: { select: { name: true } },
        },
      }),
      this.prisma.opportunity.findMany({
        where: { companyId, stage: { in: OPEN_STAGES } },
        select: { stage: true, accountId: true, estimatedValue: true },
      }),
      this.prisma.activity.groupBy({
        by: ['type'],
        where: { companyId, createdAt: inRange, isSystemGenerated: false },
        _count: { _all: true },
      }),
    ]);

    /* KPIs */
    const won = wonRows.length;
    const lost = lostRows.length;
    const winRate = won + lost === 0 ? null : won / (won + lost);
    const wonAmount = wonRows.reduce((acc, o) => acc + toInt(o.estimatedValue), 0);
    const cycles = wonRows
      .filter((o) => o.closedAt !== null)
      .map((o) => ((o.closedAt as Date).getTime() - o.createdAt.getTime()) / DAY_MS);
    const avgCycleDays =
      cycles.length === 0
        ? null
        : Math.round((cycles.reduce((a, b) => a + b, 0) / cycles.length) * 10) / 10;
    const openCount = openRows.length;
    const openAmount = openRows.reduce((acc, o) => acc + toInt(o.estimatedValue), 0);

    /* Pipeline by stage — current open snapshot, in pipeline order (zeros kept). */
    const pipelineByStage = PIPELINE_STAGES.map(({ stage, label }) => {
      const rows = openRows.filter((o) => o.stage === stage);
      return {
        stage,
        label,
        count: rows.length,
        amount: rows.reduce((acc, o) => acc + toInt(o.estimatedValue), 0),
      };
    });

    /* Lost reasons — top 5 in range. */
    const reasonCounts = new Map<string, number>();
    for (const o of lostRows) {
      const key = o.lostReason ?? 'OTRO';
      reasonCounts.set(key, (reasonCounts.get(key) ?? 0) + 1);
    }
    const lostReasons = Array.from(reasonCounts.entries())
      .map(([reason, count]) => ({ reason, label: LOST_REASON_LABELS[reason] ?? reason, count }))
      .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
      .slice(0, 5);

    /* Lost accounts — ≥1 lost-in-range, 0 won-in-range, 0 open now; top 10 by lostAmount. */
    const wonAccountIds = new Set(wonRows.map((o) => o.accountId));
    const openAccountIds = new Set(openRows.map((o) => o.accountId));
    const lostByAccount = new Map<
      string,
      {
        accountId: string;
        name: string;
        lastLostAt: Date;
        lastReason: string | null;
        lostAmount: number;
      }
    >();
    for (const o of lostRows) {
      if (wonAccountIds.has(o.accountId) || openAccountIds.has(o.accountId)) continue;
      const closedAt = o.closedAt as Date;
      const cur = lostByAccount.get(o.accountId);
      if (!cur) {
        lostByAccount.set(o.accountId, {
          accountId: o.accountId,
          name: o.account.name,
          lastLostAt: closedAt,
          lastReason: o.lostReason,
          lostAmount: toInt(o.estimatedValue),
        });
      } else {
        cur.lostAmount += toInt(o.estimatedValue);
        if (closedAt.getTime() > cur.lastLostAt.getTime()) {
          cur.lastLostAt = closedAt;
          cur.lastReason = o.lostReason;
        }
      }
    }
    const lostAccounts = Array.from(lostByAccount.values())
      .sort(
        (a, b) => b.lostAmount - a.lostAmount || b.lastLostAt.getTime() - a.lastLostAt.getTime(),
      )
      .slice(0, 10)
      .map((a) => ({
        ...a,
        lastLostAt: a.lastLostAt.toISOString(),
        lastReasonLabel: a.lastReason ? (LOST_REASON_LABELS[a.lastReason] ?? a.lastReason) : null,
      }));

    /* Top accounts — top 5 by wonAmount in range. */
    const wonByAccount = new Map<
      string,
      { accountId: string; name: string; wonCount: number; wonAmount: number }
    >();
    for (const o of wonRows) {
      const cur = wonByAccount.get(o.accountId) ?? {
        accountId: o.accountId,
        name: o.account.name,
        wonCount: 0,
        wonAmount: 0,
      };
      cur.wonCount += 1;
      cur.wonAmount += toInt(o.estimatedValue);
      wonByAccount.set(o.accountId, cur);
    }
    const topAccounts = Array.from(wonByAccount.values())
      .sort((a, b) => b.wonAmount - a.wonAmount || b.wonCount - a.wonCount)
      .slice(0, 5);

    /* Activities by type — created in range. */
    const activitiesByType = activityGroups
      .map((g) => ({
        type: g.type as string,
        label: ACTIVITY_TYPE_LABELS[g.type],
        count: g._count._all,
      }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));

    return {
      range: { from: range.from, to: range.to },
      kpis: { created, won, lost, winRate, wonAmount, avgCycleDays, openCount, openAmount },
      pipelineByStage,
      lostReasons,
      lostAccounts,
      topAccounts,
      activitiesByType,
    };
  }
}
