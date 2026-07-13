import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/* MKT-006 — the Comercial EXPOSE side of the attribution contract (Part 1 §4). Reads
 * ONLY Comercial's own `accounts` table and imports NOTHING from Marketing, so the
 * module graph stays acyclic (Accounts → Campaigns → AttributionRead). Marketing's
 * CampaignsModule consumes this for the campaign delete guard. MKT-007 will extend THIS
 * SAME service with the ROI read (won opportunities + accepted-quote net amounts). */
@Injectable()
export class AccountAttributionReadService {
  constructor(private readonly prisma: PrismaService) {}

  /** How many accounts in this company are attributed to the given campaign. */
  async countBySourceCampaign(companyId: string, campaignId: string): Promise<number> {
    return this.prisma.account.count({ where: { companyId, sourceCampaignId: campaignId } });
  }
}
