import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

const PROXIMAS_LIMIT = 5;

@Injectable()
export class MarketingDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Dashboard aggregates. SPEND SOURCE: marketing_expenses (the actual money
   * spent), NOT campaign.cost (which is the planned budget). gastoTotal,
   * gastoPorCampana and gastoPorCanal all sum expense.amount.
   *
   * The funnel block (campanasActivas, leadsGenerados, leadsPorCanal,
   * oportunidadesGeneradas, ventasAtribuidas, costoPorLead) is derived from
   * READ-ONLY cross-module reads of Comercial (CrmLead / CrmOpportunity by
   * sourceCampaignId). Comercial is never mutated.
   */
  async getDashboard(companyId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [expenses, proximas, campaigns] = await Promise.all([
      this.prisma.marketingExpense.findMany({
        where: { companyId },
        include: { campaign: { select: { id: true, name: true } } },
      }),
      this.prisma.marketingCampaign.findMany({
        where: { companyId, startDate: { gte: today } },
        orderBy: { startDate: 'asc' },
        take: PROXIMAS_LIMIT,
      }),
      // All this company's campaigns — used both for the channel map and for the
      // active-campaign count and total cost.
      this.prisma.marketingCampaign.findMany({
        where: { companyId },
        select: { id: true, channel: true, status: true, cost: true },
      }),
    ]);

    let gastoTotal = 0;

    // Spend per campaign (expenses with a campaignId) — keyed by campaign id.
    const porCampana = new Map<
      string,
      { campaignId: string; name: string; total: number }
    >();
    // Spend per channel — expense.channel, falling back to the campaign channel.
    const porCanal = new Map<string, number>();

    for (const e of expenses) {
      const amount = Number(e.amount);
      gastoTotal += amount;

      if (e.campaign) {
        const entry =
          porCampana.get(e.campaign.id) ??
          { campaignId: e.campaign.id, name: e.campaign.name, total: 0 };
        entry.total += amount;
        porCampana.set(e.campaign.id, entry);
      }

      const canal = e.channel ?? 'Sin canal';
      porCanal.set(canal, (porCanal.get(canal) ?? 0) + amount);
    }

    const gastoPorCampana = [...porCampana.values()]
      .map((v) => ({ ...v, total: Math.round(v.total) }))
      .sort((a, b) => b.total - a.total);

    const gastoPorCanal = [...porCanal.entries()]
      .map(([channel, total]) => ({ channel, total: Math.round(total) }))
      .sort((a, b) => b.total - a.total);

    const proximasCampanas = proximas.map((c) => ({
      id: c.id,
      name: c.name,
      channel: c.channel,
      startDate: c.startDate,
      endDate: c.endDate,
      cost: Number(c.cost),
      status: c.status,
    }));

    /* ── FUNNEL block — READ-ONLY Comercial cross-reads ── */

    const campaignIds = campaigns.map((c) => c.id);
    const channelByCampaign = new Map(campaigns.map((c) => [c.id, c.channel]));
    const campanasActivas = campaigns.filter((c) => c.status === 'ACTIVA').length;
    const totalCampaignCost = campaigns.reduce((s, c) => s + Number(c.cost), 0);

    // Leads attributed to ANY of this company's campaigns.
    const attributedLeads =
      campaignIds.length === 0
        ? []
        : await this.prisma.crmLead.findMany({
            where: { companyId, sourceCampaignId: { in: campaignIds } },
            select: { sourceCampaignId: true },
          });

    const leadsGenerados = attributedLeads.length;

    // Group leads by their source campaign's channel (null → "Otro").
    const leadsByChannel = new Map<string, number>();
    for (const l of attributedLeads) {
      const channel =
        (l.sourceCampaignId && channelByCampaign.get(l.sourceCampaignId)) ||
        'Otro';
      leadsByChannel.set(channel, (leadsByChannel.get(channel) ?? 0) + 1);
    }
    const leadsPorCanal = [...leadsByChannel.entries()]
      .map(([channel, leads]) => ({ channel, leads }))
      .sort((a, b) => b.leads - a.leads);

    // Opportunities sourced from any campaign (sourceCampaignId set).
    const oppsWithSource = await this.prisma.crmOpportunity.findMany({
      where: { companyId, sourceCampaignId: { not: null } },
      include: { stage: { select: { isWon: true } } },
    });
    const oportunidadesGeneradas = oppsWithSource.length;
    const ventasAtribuidas = oppsWithSource
      .filter((o) => o.stage.isWon)
      .reduce((sum, o) => sum + Number(o.amount), 0);

    const costoPorLead = Math.round(
      totalCampaignCost / Math.max(leadsGenerados, 1),
    );

    return {
      gastoTotal: Math.round(gastoTotal),
      gastoPorCampana,
      gastoPorCanal,
      proximasCampanas,
      // Funnel block.
      campanasActivas,
      leadsGenerados,
      leadsPorCanal,
      oportunidadesGeneradas,
      ventasAtribuidas: Math.round(ventasAtribuidas),
      costoPorLead,
    };
  }
}
