import { Injectable } from '@nestjs/common';
import { OpportunityStage, QuoteStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { todayInSantiago } from '../../common/santiago-date';
import { OpportunitiesService } from '../opportunities/opportunities.service';

/* ALERT-001 — the Comercial alerts panel (CRM-6): what needs attention, DERIVED LIVE on
 * every read. A PANEL, NOT A NOTIFIER: no cron, no stored alert rows, no notifications,
 * no per-user dismiss (V2). Founder thresholds (2026-09-17) live HERE and nowhere else:
 *   quotesUnanswered   = quotes in ENVIADA (sent to the client, sentAt set by the quote
 *                        state machine) whose sentAt is ≥ 7 days ago; oldest first.
 *   staleOpportunities = OPEN opportunities whose lastMovementAt (COM-020's
 *                        lastMovementByOpportunity, reused — GREATEST of updatedAt,
 *                        activities, notes, live documents) is ≥ 14 days ago; oldest first.
 *   overdueClose       = OPEN opportunities with expectedCloseDate < TODAY IN CHILE
 *                        (America/Santiago, the CAL-008b doctrine); most overdue first.
 * OPEN here = the five active stages. EN_PAUSA is EXCLUDED on purpose: pausing is a
 * deliberate act, so a paused deal is neither "stale" nor "overdue". GANADA/PERDIDA are
 * closed. An opportunity may appear in both opportunity lists. lastMovementAt can never
 * be null for an existing row (GREATEST includes its own updatedAt), so no null branch.
 * Every query carries the explicit companyId; one round of queries; the only raw SQL is
 * the reused COM-020 helper. */

export const QUOTE_UNANSWERED_DAYS = 7;
export const STALE_OPPORTUNITY_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/* The five active stages — EN_PAUSA deliberately absent (see header). */
export const ALERT_OPEN_STAGES: OpportunityStage[] = [
  OpportunityStage.PROSPECTO,
  OpportunityStage.CONTACTO,
  OpportunityStage.VISITA_TECNICA,
  OpportunityStage.COTIZACION,
  OpportunityStage.NEGOCIACION,
];

const utcDayOf = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
const dayDiff = (later: Date, earlier: Date): number =>
  Math.floor((later.getTime() - earlier.getTime()) / DAY_MS);

@Injectable()
export class AlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly opportunities: OpportunitiesService,
  ) {}

  async getAlerts(companyId: string, summary: boolean) {
    const now = new Date();
    const quoteCutoff = new Date(now.getTime() - QUOTE_UNANSWERED_DAYS * DAY_MS);
    const staleCutoff = new Date(now.getTime() - STALE_OPPORTUNITY_DAYS * DAY_MS);
    const today = todayInSantiago();
    const todayUtc = utcDayOf(today);

    if (summary)
      return { counts: await this.counts(companyId, quoteCutoff, staleCutoff, todayUtc) };

    const [quotes, openRows] = await Promise.all([
      this.prisma.quote.findMany({
        where: { companyId, status: QuoteStatus.ENVIADA, sentAt: { lte: quoteCutoff } },
        orderBy: [{ sentAt: 'asc' }],
        select: {
          id: true,
          quoteNumber: true,
          sentAt: true,
          opportunity: {
            select: { id: true, name: true, account: { select: { id: true, name: true } } },
          },
        },
      }),
      this.prisma.opportunity.findMany({
        where: { companyId, stage: { in: ALERT_OPEN_STAGES } },
        select: {
          id: true,
          name: true,
          stage: true,
          ownerId: true,
          expectedCloseDate: true,
          accountId: true,
          account: { select: { name: true } },
        },
      }),
    ]);
    const lastMovement = await this.opportunities.lastMovementByOpportunity(
      companyId,
      openRows.map((o) => o.id),
    );

    const quotesUnanswered = quotes.map((q) => ({
      quoteId: q.id,
      quoteNumber: q.quoteNumber ?? null,
      opportunityId: q.opportunity.id,
      opportunityName: q.opportunity.name,
      accountId: q.opportunity.account.id,
      accountName: q.opportunity.account.name,
      sentAt: (q.sentAt as Date).toISOString(),
      days: dayDiff(now, q.sentAt as Date),
    }));

    const staleOpportunities = openRows
      .map((o) => ({ o, last: lastMovement.get(o.id) }))
      .filter(
        (x): x is { o: (typeof openRows)[number]; last: Date } =>
          x.last !== undefined && x.last.getTime() <= staleCutoff.getTime(),
      )
      .sort((a, b) => a.last.getTime() - b.last.getTime())
      .map(({ o, last }) => ({
        opportunityId: o.id,
        name: o.name,
        accountId: o.accountId,
        accountName: o.account.name,
        stage: o.stage,
        ownerId: o.ownerId,
        lastMovementAt: last.toISOString(),
        days: dayDiff(now, last),
      }));

    const overdueClose = openRows
      .filter((o) => o.expectedCloseDate !== null && (o.expectedCloseDate as Date) < todayUtc)
      .map((o) => ({
        opportunityId: o.id,
        name: o.name,
        accountId: o.accountId,
        accountName: o.account.name,
        stage: o.stage,
        ownerId: o.ownerId,
        expectedCloseDate: (o.expectedCloseDate as Date).toISOString().slice(0, 10),
        daysOverdue: dayDiff(todayUtc, o.expectedCloseDate as Date),
      }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue);

    const counts = {
      quotesUnanswered: quotesUnanswered.length,
      staleOpportunities: staleOpportunities.length,
      overdueClose: overdueClose.length,
      total: quotesUnanswered.length + staleOpportunities.length + overdueClose.length,
    };
    return { counts, quotesUnanswered, staleOpportunities, overdueClose };
  }

  /** summary=true — counts only (the sidebar badge): count queries for quotes and overdue;
   * stale needs the open ids + the reused raw helper (no full rows, no lists returned). */
  private async counts(companyId: string, quoteCutoff: Date, staleCutoff: Date, todayUtc: Date) {
    const [quotesUnanswered, overdueClose, openIds] = await Promise.all([
      this.prisma.quote.count({
        where: { companyId, status: QuoteStatus.ENVIADA, sentAt: { lte: quoteCutoff } },
      }),
      this.prisma.opportunity.count({
        where: { companyId, stage: { in: ALERT_OPEN_STAGES }, expectedCloseDate: { lt: todayUtc } },
      }),
      this.prisma.opportunity.findMany({
        where: { companyId, stage: { in: ALERT_OPEN_STAGES } },
        select: { id: true },
      }),
    ]);
    const lastMovement = await this.opportunities.lastMovementByOpportunity(
      companyId,
      openIds.map((o) => o.id),
    );
    let staleOpportunities = 0;
    for (const last of lastMovement.values()) {
      if (last.getTime() <= staleCutoff.getTime()) staleOpportunities += 1;
    }
    return {
      quotesUnanswered,
      staleOpportunities,
      overdueClose,
      total: quotesUnanswered + staleOpportunities + overdueClose,
    };
  }
}
