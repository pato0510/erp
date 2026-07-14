import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CampaignChannel, CampaignStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { AccountAttributionReadService } from '../../comercial/attribution-read/attribution-read.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

interface ListFilters {
  status?: CampaignStatus;
  channel?: CampaignChannel;
}

/* MKT-002 — the campaign status machine, as directed adjacency (current → allowed
   targets). No self-loops, so same-status moves are rejected. Encodes Part 1 §2.1:
   - Free movement among BORRADOR/ACTIVA/PAUSADA (all directed pairs).
   - ACTIVA/PAUSADA → FINALIZADA | CANCELADA (semi-terminal).
   - FINALIZADA/CANCELADA → ACTIVA only (explicit reopen).
   The extra "into ACTIVA requires startDate" guard (decision f) is applied on top. */
const STATUS_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  [CampaignStatus.BORRADOR]: [CampaignStatus.ACTIVA, CampaignStatus.PAUSADA],
  [CampaignStatus.ACTIVA]: [
    CampaignStatus.BORRADOR,
    CampaignStatus.PAUSADA,
    CampaignStatus.FINALIZADA,
    CampaignStatus.CANCELADA,
  ],
  [CampaignStatus.PAUSADA]: [
    CampaignStatus.BORRADOR,
    CampaignStatus.ACTIVA,
    CampaignStatus.FINALIZADA,
    CampaignStatus.CANCELADA,
  ],
  [CampaignStatus.FINALIZADA]: [CampaignStatus.ACTIVA],
  [CampaignStatus.CANCELADA]: [CampaignStatus.ACTIVA],
};

/* Closed states: general-field edits (PATCH /:id) are blocked here; the only way out
   is the status endpoint (reopen → ACTIVA). Mirrors the COM-005 closed-deal guard. */
const CLOSED_STATUSES: CampaignStatus[] = [CampaignStatus.FINALIZADA, CampaignStatus.CANCELADA];

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
    // MKT-006 — Comercial's exposed reader (via AttributionReadModule) for the delete
    // guard. Marketing never queries the accounts table directly.
    private readonly attributionRead: AccountAttributionReadService,
  ) {}

  /** Anchor a YYYY-MM-DD (or ISO) string to UTC midnight so an @db.Date column
   * never suffers the timezone off-by-one (the RRHH HR-004b convention). */
  private toDateOnly(dateStr: string): Date {
    const d = new Date(dateStr);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  /** endDate must never precede startDate. Compares the effective (post-update)
   * date pair — either may be a fresh string or a persisted Date, or null. */
  private assertDateOrder(start: Date | null, end: Date | null) {
    if (start && end && end.getTime() < start.getTime()) {
      throw new BadRequestException(
        'La fecha de término no puede ser anterior a la fecha de inicio.',
      );
    }
  }

  /* MKT-005 — attach the READ-TIME derived fields (never stored). `spent` is the
     Decimal Σ(amount) computed by the caller. `overBudget` = budget set AND spent
     STRICTLY greater than budget (equal is NOT over). `endingSoon` = ACTIVA AND endDate
     set AND todayUTC <= endDate <= todayUTC + 7 days (both ends inclusive; §6). */
  private withDerived<
    T extends { status: CampaignStatus; endDate: Date | null; budgetAmount: Prisma.Decimal | null },
  >(campaign: T, spent: Prisma.Decimal) {
    const overBudget = campaign.budgetAmount !== null && spent.greaterThan(campaign.budgetAmount);
    return { ...campaign, spent, overBudget, endingSoon: this.isEndingSoon(campaign) };
  }

  private isEndingSoon(campaign: { status: CampaignStatus; endDate: Date | null }): boolean {
    if (campaign.status !== CampaignStatus.ACTIVA || !campaign.endDate) return false;
    const now = new Date();
    const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const end = campaign.endDate.getTime(); // @db.Date → UTC midnight
    return end >= todayUTC && end <= todayUTC + 7 * 86_400_000;
  }

  async findAll(companyId: string, filters: ListFilters = {}) {
    const where: Prisma.CampaignWhereInput = { companyId };
    if (filters.status) where.status = filters.status;
    if (filters.channel) where.channel = filters.channel;
    // Comercial list convention: filtered company-scoped findMany, single stable
    // order, no offset pagination in V1 (volumes are small — Part 1 §3). Recency-
    // first mirrors the opportunities list (the sibling status-machine entity).
    const campaigns = await this.prisma.campaign.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }],
    });
    if (campaigns.length === 0) return [];
    // MKT-005 — one grouped Σ(amount) query for the whole page; spent is NEVER stored.
    const sums = await this.prisma.marketingExpense.groupBy({
      by: ['campaignId'],
      where: { companyId, campaignId: { in: campaigns.map((c) => c.id) } },
      _sum: { amount: true },
    });
    const spentByCampaign = new Map(
      sums.map((s) => [s.campaignId, s._sum.amount ?? new Prisma.Decimal(0)]),
    );
    return campaigns.map((c) =>
      this.withDerived(c, spentByCampaign.get(c.id) ?? new Prisma.Decimal(0)),
    );
  }

  async findOne(id: string, companyId: string) {
    const campaign = await this.prisma.campaign.findFirst({ where: { id, companyId } });
    if (!campaign) throw new NotFoundException('Campaña no encontrada');
    // MKT-005 — live Σ(amount) for this campaign; spent/overBudget/endingSoon derived.
    const agg = await this.prisma.marketingExpense.aggregate({
      where: { companyId, campaignId: id },
      _sum: { amount: true },
    });
    // MKT-007 — ROI attribution, computed live by Comercial's exposed reader (no cross-
    // module table read here). DETAIL-ONLY — the LIST payload stays light (no attribution).
    const attribution = await this.attributionRead.getCampaignReturn(companyId, id);
    return { ...this.withDerived(campaign, agg._sum.amount ?? new Prisma.Decimal(0)), attribution };
  }

  /* MKT-004 — campaigns intersecting a month (YYYY-MM), for the calendar feed. Month
     boundaries are computed in UTC (HR-004b) to match the UTC-anchored @db.Date columns.
     Ranges travel as ranges — the client expands them into per-day chips. Rules:
       - EXCLUDED: CANCELADA, and campaigns without startDate (unplaceable drafts).
       - Ranged (endDate set): intersects iff startDate <= monthEnd AND endDate >= monthStart.
       - Open-ended (endDate null): appears ONLY in its start month (startDate within month). */
  async calendar(companyId: string, month?: string) {
    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      throw new BadRequestException('El parámetro month debe tener el formato YYYY-MM.');
    }
    const [year, mon] = month.split('-').map(Number);
    // monthStart = first day (UTC); monthEnd = last day (UTC) via day 0 of the next month.
    const monthStart = new Date(Date.UTC(year, mon - 1, 1));
    const monthEnd = new Date(Date.UTC(year, mon, 0));

    const campaigns = await this.prisma.campaign.findMany({
      where: {
        companyId,
        status: { not: CampaignStatus.CANCELADA },
        OR: [
          // Ranged: both dates set, range intersects the month.
          {
            AND: [
              { startDate: { not: null, lte: monthEnd } },
              { endDate: { not: null, gte: monthStart } },
            ],
          },
          // Open-ended: no endDate, startDate falls inside the month.
          { endDate: null, startDate: { not: null, gte: monthStart, lte: monthEnd } },
        ],
      },
      select: { id: true, name: true, status: true, startDate: true, endDate: true },
      orderBy: [{ startDate: 'asc' }],
    });
    return campaigns;
  }

  async create(companyId: string, userId: string, dto: CreateCampaignDto) {
    const startDate = dto.startDate ? this.toDateOnly(dto.startDate) : null;
    const endDate = dto.endDate ? this.toDateOnly(dto.endDate) : null;
    this.assertDateOrder(startDate, endDate);
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.campaign.create({
        data: {
          companyId,
          createdBy: userId,
          name: dto.name,
          channel: dto.channel,
          // Status is forced server-side — never accepted from the DTO (decision f).
          status: CampaignStatus.BORRADOR,
          description: dto.description ?? null,
          startDate,
          endDate,
          budgetAmount:
            dto.budgetAmount !== undefined && dto.budgetAmount !== null
              ? new Prisma.Decimal(dto.budgetAmount)
              : null,
          ownerId: dto.ownerId ?? null,
          notes: dto.notes ?? null,
        },
      });
    });
  }

  /** General-field update. Status edits do NOT happen here (the DTO has no `status`);
   * status moves only through changeStatus(). Editing a closed campaign is rejected. */
  async update(id: string, companyId: string, userId: string, dto: UpdateCampaignDto) {
    const campaign = await this.findOne(id, companyId);
    if (CLOSED_STATUSES.includes(campaign.status)) {
      throw new BadRequestException(
        'No se puede editar una campaña finalizada o cancelada. Reábrela (estado → ACTIVA) para modificarla.',
      );
    }

    const data: Prisma.CampaignUncheckedUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.channel !== undefined) data.channel = dto.channel;
    if (dto.description !== undefined) data.description = dto.description ?? null;
    if (dto.ownerId !== undefined) data.ownerId = dto.ownerId ?? null;
    if (dto.notes !== undefined) data.notes = dto.notes ?? null;
    if (dto.budgetAmount !== undefined) {
      data.budgetAmount = dto.budgetAmount === null ? null : new Prisma.Decimal(dto.budgetAmount);
    }

    // Resolve the effective date pair (dto override wins; else keep the persisted
    // value) so endDate ≥ startDate holds across partial updates.
    const nextStart =
      dto.startDate !== undefined
        ? dto.startDate
          ? this.toDateOnly(dto.startDate)
          : null
        : campaign.startDate;
    const nextEnd =
      dto.endDate !== undefined
        ? dto.endDate
          ? this.toDateOnly(dto.endDate)
          : null
        : campaign.endDate;
    this.assertDateOrder(nextStart, nextEnd);
    if (dto.startDate !== undefined) data.startDate = nextStart;
    if (dto.endDate !== undefined) data.endDate = nextEnd;

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.campaign.update({ where: { id }, data });
    });
  }

  /** THE canonical status-transition path — enforces the machine + the activation
   * guard. Rejects any edge not in STATUS_TRANSITIONS (incl. same-status no-ops and
   * BORRADOR → FINALIZADA/CANCELADA). */
  async changeStatus(id: string, companyId: string, userId: string, to: CampaignStatus) {
    const campaign = await this.findOne(id, companyId);
    const from = campaign.status;

    const allowed = STATUS_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
      throw new BadRequestException(`Transición de estado no permitida: ${from} → ${to}.`);
    }
    // Activation guard (decision f): a campaign cannot enter ACTIVA without a start
    // date — applies to plain activation AND to a reopen back to ACTIVA.
    if (to === CampaignStatus.ACTIVA && !campaign.startDate) {
      throw new BadRequestException(
        'Para activar la campaña debes definir la fecha de inicio (startDate).',
      );
    }

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.campaign.update({ where: { id }, data: { status: to } });
    });
  }

  /** Hard delete ONLY for a BORRADOR campaign. Anything else is CANCELADA, never
   * deleted — preserves attribution/spend history (decision d). */
  async remove(id: string, companyId: string, userId: string) {
    const campaign = await this.findOne(id, companyId);
    if (campaign.status !== CampaignStatus.BORRADOR) {
      throw new ConflictException(
        'Solo se puede eliminar una campaña en estado BORRADOR. Las demás se cancelan (estado → CANCELADA) para conservar el historial.',
      );
    }
    // MKT-006 — pristine-BORRADOR guard, FINAL form (decision d): a draft may be hard-
    // deleted ONLY when it has zero expenses AND zero attributed accounts. Each check
    // throws a 409 naming the ACTUAL blocker. Deleting otherwise would destroy spend
    // history (ON DELETE CASCADE on expenses) or silently detach accounts (ON DELETE SET
    // NULL on the sourceCampaignId FK) — the DB rules are only the safety net UNDER this
    // guard. The attributed-accounts count comes from Comercial's exposed reader, never a
    // cross-module table read.
    const expenseCount = await this.prisma.marketingExpense.count({
      where: { companyId, campaignId: id },
    });
    if (expenseCount > 0) {
      throw new ConflictException(
        'No se puede eliminar una campaña con gastos registrados. Elimina primero los gastos o cancela la campaña (estado → CANCELADA) para conservar el historial.',
      );
    }
    const attributedAccounts = await this.attributionRead.countBySourceCampaign(companyId, id);
    if (attributedAccounts > 0) {
      throw new ConflictException(
        'No se puede eliminar una campaña con cuentas atribuidas. Quita la campaña de origen en esas cuentas o cancela la campaña (estado → CANCELADA) para conservar el historial.',
      );
    }
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.campaign.delete({ where: { id } });
    });
  }
}
