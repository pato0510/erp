import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

/**
 * Marketing → Comercial ROI bridge (read-only join across modules by id). For
 * each MarketingCampaign:
 *   • cost              = campaign.cost (planned budget).
 *   • attributedRevenue = Σ amount of WON opportunities (stage.isWon) whose
 *                         sourceCampaignId = campaign.id.
 *   • wonCount          = number of those won opportunities.
 *   • roi               = cost>0 ? (attributedRevenue - cost) / cost : null.
 * Sorted by attributedRevenue desc. This is the data behind the "Marketing ROI"
 * tile; the GOLDEN THREAD campaign appears here with a POSITIVE roi.
 */
@Injectable()
export class CampaignRoiService {
  constructor(private readonly prisma: PrismaService) {}

  async getRoi(companyId: string) {
    const [campaigns, wonOpps] = await Promise.all([
      this.prisma.marketingCampaign.findMany({
        where: { companyId },
        select: { id: true, name: true, channel: true, cost: true },
      }),
      this.prisma.crmOpportunity.findMany({
        where: { companyId, sourceCampaignId: { not: null }, stage: { isWon: true } },
        select: { sourceCampaignId: true, amount: true },
      }),
    ]);

    const attributed = new Map<string, { revenue: number; wonCount: number }>();
    for (const o of wonOpps) {
      if (!o.sourceCampaignId) continue;
      const a = attributed.get(o.sourceCampaignId) ?? { revenue: 0, wonCount: 0 };
      a.revenue += Number(o.amount);
      a.wonCount += 1;
      attributed.set(o.sourceCampaignId, a);
    }

    return campaigns
      .map((c) => {
        const a = attributed.get(c.id) ?? { revenue: 0, wonCount: 0 };
        const cost = Number(c.cost);
        const attributedRevenue = Math.round(a.revenue);
        const roi = cost > 0 ? (attributedRevenue - cost) / cost : null;
        return {
          campaignId: c.id,
          campaignName: c.name,
          channel: c.channel,
          cost: Math.round(cost),
          attributedRevenue,
          wonCount: a.wonCount,
          roi,
        };
      })
      .sort((a, b) => b.attributedRevenue - a.attributedRevenue);
  }
}
