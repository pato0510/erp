import { Injectable } from '@nestjs/common';
import { OpportunityStage, Prisma, QuoteStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface CampaignReturn {
  accountsCount: number;
  wonCount: number;
  wonNetAmount: Prisma.Decimal;
}

export interface OpportunityOrigin {
  opportunityId: string;
  opportunityName: string;
  accountId: string;
  accountName: string;
  sourceCampaignId: string | null; // RAW id — the campaign NAME is resolved by the consumer
}

export interface WonDeal {
  opportunityId: string;
  name: string;
  netAmount: Prisma.Decimal;
}

/* MKT-007b — the ability-shaped "Origen del negocio" payload embedded in the ServiceOrder
   and Commitment DETAIL responses. `campaign` is null when the account has no source
   campaign (conditional #2) OR the caller cannot read Campaign. The whole object is null
   (omitted) when the artifact is not opportunity-born or the caller cannot read
   Opportunity (conditional #1). */
export interface BusinessOrigin {
  opportunity: { id: string; name: string };
  account: { id: string; name: string };
  campaign: { id: string; name: string } | null;
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

  /* MKT-007b — the ORIGIN of an opportunity (for the cross-module "Origen del negocio"
   * card). Returns the opportunity + its account + the account's RAW sourceCampaignId
   * (NO campaign name — the consumer resolves the name via CampaignLookupService, and
   * only if the caller may read Campaign). Reads only Comercial tables. Returns null if
   * the opportunity does not exist / is in another company → the caller renders no card. */
  async getOpportunityOrigin(
    companyId: string,
    opportunityId: string,
  ): Promise<OpportunityOrigin | null> {
    const opp = await this.prisma.opportunity.findFirst({
      where: { id: opportunityId, companyId },
      select: {
        id: true,
        name: true,
        account: { select: { id: true, name: true, sourceCampaignId: true } },
      },
    });
    if (!opp) return null;
    return {
      opportunityId: opp.id,
      opportunityName: opp.name,
      accountId: opp.account.id,
      accountName: opp.account.name,
      sourceCampaignId: opp.account.sourceCampaignId,
    };
  }

  /* MKT-007b — the won-deals list for a campaign (the Retorno mirror). Same semantics as
   * getCampaignReturn: the CURRENTLY-GANADA opportunities of the campaign's attributed
   * accounts, each with its ACEPTADA quote netAmount (a GANADA without an ACEPTADA quote
   * appears with netAmount 0). Reads only Comercial tables. */
  async listWonDeals(companyId: string, campaignId: string): Promise<WonDeal[]> {
    const accounts = await this.prisma.account.findMany({
      where: { companyId, sourceCampaignId: campaignId },
      select: { id: true },
    });
    if (accounts.length === 0) return [];
    const wonOpps = await this.prisma.opportunity.findMany({
      where: {
        companyId,
        accountId: { in: accounts.map((a) => a.id) },
        stage: OpportunityStage.GANADA,
      },
      select: { id: true, name: true },
      orderBy: [{ name: 'asc' }],
    });
    if (wonOpps.length === 0) return [];
    const quotes = await this.prisma.quote.findMany({
      where: {
        companyId,
        opportunityId: { in: wonOpps.map((o) => o.id) },
        status: QuoteStatus.ACEPTADA,
      },
      select: { opportunityId: true, netAmount: true },
    });
    const netByOpp = new Map(quotes.map((q) => [q.opportunityId, q.netAmount]));
    return wonOpps.map((o) => ({
      opportunityId: o.id,
      name: o.name,
      netAmount: netByOpp.get(o.id) ?? new Prisma.Decimal(0),
    }));
  }
}
