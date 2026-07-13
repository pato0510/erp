import { Injectable } from '@nestjs/common';
import { CampaignStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/* MKT-006 — the Marketing EXPOSE side of the campaign↔account attribution contract
 * (Part 1 §4). Exported by CampaignsModule and consumed by Comercial's AccountsModule
 * via DI, so Comercial never queries the campaigns table directly. Read-only, minimal
 * projection ({ id, name, status }) — never the money-bearing campaign fields. */
@Injectable()
export class CampaignLookupService {
  constructor(private readonly prisma: PrismaService) {}

  /** Options for the "Campaña de origen" select: EXCLUDES CANCELADA (you don't attribute
   * a new account to a cancelled campaign), ordered by name. */
  async listForSelect(companyId: string) {
    return this.prisma.campaign.findMany({
      where: { companyId, status: { not: CampaignStatus.CANCELADA } },
      select: { id: true, name: true, status: true },
      orderBy: [{ name: 'asc' }],
    });
  }

  /** Company-scoped existence check used to VALIDATE an attribution and ENRICH a name.
   * INCLUDES CANCELADA on purpose: an account already attributed to a campaign that was
   * later cancelled must still resolve its name. Returns null if not found OR in another
   * company (the FK alone does not check tenant — this does). */
  async getForCompany(companyId: string, id: string) {
    return this.prisma.campaign.findFirst({
      where: { id, companyId },
      select: { id: true, name: true, status: true },
    });
  }
}
