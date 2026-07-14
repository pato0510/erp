import { Injectable } from '@nestjs/common';
import { OpportunityStage, Prisma, QuoteStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface CampaignReturn {
  accountsCount: number;
  wonCount: number;
  wonNetAmount: Prisma.Decimal;
}

/* MKT-006/007 — the Comercial EXPOSE side of the attribution contract (Part 1 §4). Reads
 * ONLY Comercial's own tables (accounts / opportunities / quotes) and imports NOTHING
 * from Marketing, so the module graph stays acyclic (Accounts → Campaigns →
 * AttributionRead). Marketing's CampaignsModule consumes this for the campaign delete
 * guard (MKT-006) and the Retorno/ROI read (MKT-007). Live computation — no caching, no
 * rollups. */
@Injectable()
export class AccountAttributionReadService {
  constructor(private readonly prisma: PrismaService) {}

  /** How many accounts in this company are attributed to the given campaign. */
  async countBySourceCampaign(companyId: string, campaignId: string): Promise<number> {
    return this.prisma.account.count({ where: { companyId, sourceCampaignId: campaignId } });
  }

  /* MKT-007 — the ROI read for a campaign (Part 1 §3). Explicit field map:
   *   - accountsCount : accounts with sourceCampaignId = campaignId (this company).
   *   - wonCount      : opportunities of those accounts CURRENTLY in stage GANADA. The
   *                     `stage: GANADA` filter is evaluated AT QUERY TIME, so a reopened
   *                     deal (now e.g. NEGOCIACION) DROPS OUT until re-won — even if its
   *                     ACEPTADA quote still exists (§3 pitfall, resolved by design).
   *   - wonNetAmount  : Decimal-safe Σ of the netAmount of each such opportunity's
   *                     ACEPTADA quote. RULE: a GANADA opportunity WITHOUT an ACEPTADA
   *                     quote still counts in wonCount and contributes 0 to the sum (the
   *                     aggregate only sees ACEPTADA quotes of currently-GANADA opps).
   * Reads only Comercial tables; no cross-module access. */
  async getCampaignReturn(companyId: string, campaignId: string): Promise<CampaignReturn> {
    const accounts = await this.prisma.account.findMany({
      where: { companyId, sourceCampaignId: campaignId },
      select: { id: true },
    });
    const accountsCount = accounts.length;
    if (accountsCount === 0) {
      return { accountsCount: 0, wonCount: 0, wonNetAmount: new Prisma.Decimal(0) };
    }

    const accountIds = accounts.map((a) => a.id);
    const wonOpps = await this.prisma.opportunity.findMany({
      where: { companyId, accountId: { in: accountIds }, stage: OpportunityStage.GANADA },
      select: { id: true },
    });
    const wonCount = wonOpps.length;
    if (wonCount === 0) {
      return { accountsCount, wonCount: 0, wonNetAmount: new Prisma.Decimal(0) };
    }

    // Σ netAmount of the ACEPTADA quote of each CURRENTLY-GANADA opportunity. At most one
    // ACEPTADA quote per opportunity (DB partial-unique invariant), so no double counting.
    const agg = await this.prisma.quote.aggregate({
      where: {
        companyId,
        opportunityId: { in: wonOpps.map((o) => o.id) },
        status: QuoteStatus.ACEPTADA,
      },
      _sum: { netAmount: true },
    });
    return { accountsCount, wonCount, wonNetAmount: agg._sum.netAmount ?? new Prisma.Decimal(0) };
  }
}
