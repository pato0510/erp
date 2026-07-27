import { Injectable } from '@nestjs/common';
import { OpportunityStage } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/* CAL-017 — the narrowed contract for the master calendar's `cierres esperados` collection (the
 * signed exposure matrix, 2026-07-23). STRUCTURALLY minimal: name + expected date, NOTHING else.
 * NO estimatedValue/amount (money) and — deliberately — NO stage: the matrix says "opportunity
 * name + expected date", and the pipeline stage of a deal is commercially sensitive. The absence
 * of those keys IS the guarantee (the BirthdayEntry / ServicioCalendarEntry discipline). */

export interface CierreCalendarEntry {
  opportunityId: string; // stable render key + the id the ability-shaped link resolves
  name: string;
  expectedDate: string; // ISO of the expectedCloseDate @db.Date (UTC midnight)
}

/* Open pipeline = every stage EXCEPT the two semi-terminal outcomes. An expected close only means
 * something while the deal is still in play. */
const CLOSED_STAGES: OpportunityStage[] = [OpportunityStage.GANADA, OpportunityStage.PERDIDA];

@Injectable()
export class ComercialCierresReadService {
  constructor(private readonly prisma: PrismaService) {}

  /** CAL-017 — open opportunities whose expectedCloseDate falls in [start, end]. The rule:
   *  `expectedCloseDate IN [start, end] AND stage NOT IN (GANADA, PERDIDA)` — a won or lost deal
   *  has no "expected close" to show. Raw rows, narrowed to the money-free / stage-free shape (the
   *  SELECT never even reads estimatedValue or stage beyond the where filter). */
  async listCierresForRange(
    companyId: string,
    start: Date,
    end: Date,
  ): Promise<CierreCalendarEntry[]> {
    const rows = await this.prisma.opportunity.findMany({
      where: {
        companyId,
        stage: { notIn: CLOSED_STAGES },
        expectedCloseDate: { gte: start, lte: end },
      },
      select: { id: true, name: true, expectedCloseDate: true },
      orderBy: { expectedCloseDate: 'asc' },
    });
    return rows.flatMap((r) => {
      if (!r.expectedCloseDate) return []; // the where excludes nulls — guard, not assertion
      return [
        { opportunityId: r.id, name: r.name, expectedDate: r.expectedCloseDate.toISOString() },
      ];
    });
  }
}
