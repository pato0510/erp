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

  /** CAL-017 — the campaigns intersecting [start, end], for the master calendar's `campanas`
   * collection. REPLICATES, byte-for-byte, the derivation of the GET /marketing/campaigns/calendar
   * endpoint (CampaignsService.calendar, campaigns.service.ts:146-175) so the master shows THE SAME
   * SET Marketing shows. The rule, quoted from that method:
   *   - EXCLUDED: CANCELADA, and campaigns without startDate (unplaceable drafts).
   *   - Ranged (endDate set): intersects iff startDate <= end AND endDate >= start.
   *   - Open-ended (endDate null): appears ONLY when its startDate falls inside [start, end].
   * The endpoint computes end = Date.UTC(year, mon, 0) (last day, UTC midnight); the composer here
   * passes the last-millisecond of the month. For @db.Date columns (always UTC midnight) the two
   * are DAY-EQUIVALENT — no stored date lies strictly between last-day-00:00 and last-day-23:59 —
   * so the produced set is identical. STRUCTURAL: the projection is money-free by construction
   * (no budgetAmount / spent / any money key), exactly like the endpoint's select. */
  async listForCalendarRange(companyId: string, start: Date, end: Date) {
    const campaigns = await this.prisma.campaign.findMany({
      where: {
        companyId,
        status: { not: CampaignStatus.CANCELADA },
        OR: [
          // Ranged: both dates set, range intersects the window.
          {
            AND: [{ startDate: { not: null, lte: end } }, { endDate: { not: null, gte: start } }],
          },
          // Open-ended: no endDate, startDate falls inside the window.
          { endDate: null, startDate: { not: null, gte: start, lte: end } },
        ],
      },
      select: { id: true, name: true, status: true, startDate: true, endDate: true },
      orderBy: [{ startDate: 'asc' }],
    });
    return campaigns.map((c) => ({
      campaignId: c.id,
      name: c.name,
      status: c.status,
      startDate: c.startDate ? c.startDate.toISOString() : null,
      endDate: c.endDate ? c.endDate.toISOString() : null,
    }));
  }
}
