import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

const TOP_CLIENTS_LIMIT = 5;

@Injectable()
export class ComercialDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * CRM dashboard aggregates.
   *   • pipelineValue       — Σ amount of opportunities in OPEN stages (not won, not lost).
   *   • conversionRate      — won / (won + lost) among CLOSED opportunities (0–1, null if none).
   *   • ventasDelMes        — Σ amount of WON opps whose close date (expectedCloseDate,
   *                           falling back to generatedCommitmentDate) lands in the
   *                           current calendar month.
   *   • byStage             — per-stage count + value.
   *   • topClientes         — top CLIENT counterparties by total opportunity value.
   *   • leadsNuevos         — count of leads in status NUEVO.
   *   • leadToOppConversion — CONVERTIDO leads / total leads (0–1, null if none).
   *   • ventasPorServicio   — Σ amount of WON opps grouped by serviceId → name.
   */
  async getDashboard(companyId: string) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    monthEnd.setHours(0, 0, 0, 0);

    const [stages, opps, leadStatusGroups] = await Promise.all([
      this.prisma.crmStage.findMany({
        where: { companyId },
        orderBy: { order: 'asc' },
      }),
      this.prisma.crmOpportunity.findMany({
        where: { companyId },
        include: { stage: { select: { id: true, name: true, order: true, isWon: true, isLost: true } } },
      }),
      this.prisma.crmLead.groupBy({
        by: ['status'],
        where: { companyId },
        _count: { _all: true },
      }),
    ]);

    let pipelineValue = 0;
    let wonCount = 0;
    let lostCount = 0;
    let ventasDelMes = 0;

    const byStageMap = new Map<string, { stageId: string; name: string; order: number; count: number; value: number }>();
    for (const s of stages) {
      byStageMap.set(s.id, { stageId: s.id, name: s.name, order: s.order, count: 0, value: 0 });
    }

    const clientValue = new Map<string, { value: number; count: number }>();
    // WON sales grouped by serviceId (null bucket → 'Sin servicio').
    const serviceValue = new Map<string | null, { total: number; wonCount: number }>();

    for (const o of opps) {
      const amount = Number(o.amount);
      const { isWon, isLost } = o.stage;

      const bucket = byStageMap.get(o.stage.id);
      if (bucket) {
        bucket.count += 1;
        bucket.value += amount;
      }

      if (!isWon && !isLost) pipelineValue += amount;
      if (isWon) wonCount += 1;
      if (isLost) lostCount += 1;

      if (isWon) {
        const closeDate = o.expectedCloseDate ?? o.generatedCommitmentDate;
        if (closeDate && closeDate >= monthStart && closeDate < monthEnd) {
          ventasDelMes += amount;
        }
        const sv = serviceValue.get(o.serviceId) ?? { total: 0, wonCount: 0 };
        sv.total += amount;
        sv.wonCount += 1;
        serviceValue.set(o.serviceId, sv);
      }

      // topClientes is built across ALL opportunities (open + closed) — total
      // commercial value of the relationship.
      const cv = clientValue.get(o.counterpartyId) ?? { value: 0, count: 0 };
      cv.value += amount;
      cv.count += 1;
      clientValue.set(o.counterpartyId, cv);
    }

    const closedTotal = wonCount + lostCount;
    const conversionRate = closedTotal > 0 ? wonCount / closedTotal : null;

    // Lead funnel metrics.
    let leadsTotal = 0;
    let leadsNuevos = 0;
    let leadsConvertidos = 0;
    for (const g of leadStatusGroups) {
      const c = g._count._all;
      leadsTotal += c;
      if (g.status === 'NUEVO') leadsNuevos = c;
      if (g.status === 'CONVERTIDO') leadsConvertidos = c;
    }
    const leadToOppConversion = leadsTotal > 0 ? leadsConvertidos / leadsTotal : null;

    // ventasPorServicio — resolve service names for the WON-sale buckets.
    const svcIds = [...serviceValue.keys()].filter((k): k is string => !!k);
    const svcRows = svcIds.length
      ? await this.prisma.serviceCatalog.findMany({
          where: { companyId, id: { in: svcIds } },
          select: { id: true, name: true },
        })
      : [];
    const svcName = new Map(svcRows.map((s) => [s.id, s.name]));
    const ventasPorServicio = [...serviceValue.entries()]
      .map(([serviceId, v]) => ({
        serviceId,
        serviceName: serviceId ? svcName.get(serviceId) ?? null : 'Sin servicio',
        total: Math.round(v.total),
        wonCount: v.wonCount,
      }))
      .sort((a, b) => b.total - a.total);

    // Resolve top client names (plain-column reference — manual lookup).
    const topRaw = [...clientValue.entries()]
      .map(([counterpartyId, v]) => ({ counterpartyId, value: Math.round(v.value), count: v.count }))
      .sort((a, b) => b.value - a.value)
      .slice(0, TOP_CLIENTS_LIMIT);

    const topIds = topRaw.map((t) => t.counterpartyId);
    const counterparties = topIds.length
      ? await this.prisma.counterparty.findMany({
          where: { companyId, id: { in: topIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameMap = new Map(counterparties.map((c) => [c.id, c.name]));

    const topClientes = topRaw.map((t) => ({
      counterpartyId: t.counterpartyId,
      name: nameMap.get(t.counterpartyId) ?? null,
      value: t.value,
      count: t.count,
    }));

    const byStage = [...byStageMap.values()]
      .sort((a, b) => a.order - b.order)
      .map((s) => ({ ...s, value: Math.round(s.value) }));

    return {
      pipelineValue: Math.round(pipelineValue),
      conversionRate,
      ventasDelMes: Math.round(ventasDelMes),
      byStage,
      topClientes,
      leadsNuevos,
      leadToOppConversion,
      ventasPorServicio,
    };
  }
}
