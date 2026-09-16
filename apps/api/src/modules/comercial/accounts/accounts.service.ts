import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountPriority, AccountStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { CampaignLookupService } from '../../marketing/campaigns/campaign-lookup.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

interface ListFilters {
  status?: AccountStatus;
  priority?: AccountPriority;
  search?: string;
  enterpriseId?: string; // COM-018 — accounts of one enterprise
  noEnterprise?: boolean; // COM-018 — accounts without a parent enterprise
}

/* COM-018 — the shape of the page-scoped raw "last movement" query. */
interface LastMovementRow {
  id: string;
  lastMovementAt: Date | null;
}

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
    // MKT-006 — Marketing's exposed reader (via CampaignsModule) for attribution
    // validation + "Campaña de origen" name enrichment. Comercial never queries the
    // campaigns table directly.
    private readonly campaignLookup: CampaignLookupService,
  ) {}

  /** COM-018 — the list, ordered by name (no server-side pagination), each row enriched
   * with `enterprise { id, name } | null` and the DERIVED `lastMovementAt`. */
  async findAll(companyId: string, filters: ListFilters = {}) {
    const where: Prisma.AccountWhereInput = { companyId };
    if (filters.status) where.status = filters.status;
    if (filters.priority) where.priority = filters.priority;
    if (filters.search) where.name = { contains: filters.search, mode: 'insensitive' };
    if (filters.enterpriseId && filters.noEnterprise) {
      throw new BadRequestException('enterpriseId y noEnterprise son excluyentes.');
    }
    if (filters.enterpriseId) where.enterpriseId = filters.enterpriseId;
    if (filters.noEnterprise) where.enterpriseId = null;
    const rows = await this.prisma.account.findMany({
      where,
      orderBy: [{ name: 'asc' }],
      include: { enterprise: { select: { id: true, name: true } } },
    });
    const lastMovement = await this.lastMovementByAccount(
      companyId,
      rows.map((r) => r.id),
    );
    return rows.map((r) => ({
      ...r,
      lastMovementAt: lastMovement.get(r.id)?.toISOString() ?? null,
    }));
  }

  /** COM-018 — "Último movimiento": the latest action of ANY kind on the account, DERIVED
   * at read time (never stored, never cached). ONE raw query for the whole page — no per-
   * row work, no N+1. Sources: the account's opportunities (updatedAt — stage moves,
   * edits), its activities (createdAt), the notes (COM-016) and the live documents
   * (COM-017 — uploading a file IS an action) of those opportunities. GREATEST ignores
   * NULLs in Postgres. Doctrine: raw SQL ALWAYS carries the explicit "companyId" filter
   * (HARDEN arc) — the page ids alone are not a tenant boundary. */
  private async lastMovementByAccount(
    companyId: string,
    accountIds: string[],
  ): Promise<Map<string, Date>> {
    const result = new Map<string, Date>();
    if (accountIds.length === 0) return result;
    const rows = await this.prisma.$queryRaw<LastMovementRow[]>(Prisma.sql`
      SELECT a.id, GREATEST(o.last, act.last, n.last, d.last) AS "lastMovementAt"
      FROM accounts a
      LEFT JOIN LATERAL (SELECT max("updatedAt") AS last FROM opportunities WHERE "accountId" = a.id) o ON true
      LEFT JOIN LATERAL (SELECT max("createdAt") AS last FROM activities WHERE "accountId" = a.id) act ON true
      LEFT JOIN LATERAL (SELECT max(n."createdAt") AS last FROM opportunity_notes n JOIN opportunities op ON op.id = n."opportunityId" WHERE op."accountId" = a.id) n ON true
      LEFT JOIN LATERAL (SELECT max(dd."createdAt") AS last FROM opportunity_documents dd JOIN opportunities op ON op.id = dd."opportunityId" WHERE op."accountId" = a.id AND dd."deletedAt" IS NULL) d ON true
      WHERE a."companyId" = ${companyId}::uuid AND a.id = ANY(${accountIds}::uuid[])
    `);
    for (const row of rows) {
      if (row.lastMovementAt) result.set(row.id, new Date(row.lastMovementAt));
    }
    return result;
  }

  /** Company-scoped raw account fetch (no enrichment) — used as an existence guard by
   * update/deactivate and as the base for the enriched findOne. */
  private async getAccountOrThrow(id: string, companyId: string) {
    const account = await this.prisma.account.findFirst({ where: { id, companyId } });
    if (!account) throw new NotFoundException('Cuenta no encontrada');
    return account;
  }

  /** Account detail, ENRICHED with the attributed campaign's { id, name } (or null) via
   * the Marketing-exported lookup — NEVER a direct campaigns query. getForCompany
   * includes CANCELADA so an account attributed to a later-cancelled campaign still
   * resolves its name. */
  async findOne(id: string, companyId: string) {
    const account = await this.getAccountOrThrow(id, companyId);
    const campaign = account.sourceCampaignId
      ? await this.campaignLookup.getForCompany(companyId, account.sourceCampaignId)
      : null;
    // COM-018 — the parent enterprise as { id, name } (null when unlinked).
    const enterprise = account.enterpriseId
      ? await this.prisma.enterprise.findFirst({
          where: { id: account.enterpriseId, companyId },
          select: { id: true, name: true },
        })
      : null;
    return {
      ...account,
      sourceCampaign: campaign ? { id: campaign.id, name: campaign.name } : null,
      enterprise,
    };
  }

  async create(companyId: string, userId: string, dto: CreateAccountDto) {
    // Account↔counterparty stays DECOUPLED: we NEVER create a counterparty here.
    // If a link is requested, validate it exists in THIS company (reject cross-company).
    if (dto.counterpartyId) {
      await this.assertCounterpartyInCompany(dto.counterpartyId, companyId);
    }
    // MKT-006 — a requested attribution must resolve to a campaign in THIS company (the
    // FK does not check tenant). Clearing/omitting is free.
    if (dto.sourceCampaignId) {
      await this.assertCampaignInCompany(dto.sourceCampaignId, companyId);
    }
    // COM-018 — a requested parent enterprise must exist in THIS company and be active.
    if (dto.enterpriseId) {
      await this.assertEnterpriseActiveInCompany(dto.enterpriseId, companyId);
    }
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.account.create({
        data: {
          companyId,
          createdBy: userId,
          name: dto.name,
          status: dto.status ?? AccountStatus.PROSPECTO,
          industry: dto.industry ?? null,
          priority: dto.priority ?? AccountPriority.MEDIA,
          commercialRisk: dto.commercialRisk ?? null,
          paymentTermDays: dto.paymentTermDays ?? 30, // COM-014 — mirror the DB default explicitly
          ownerId: dto.ownerId ?? null,
          counterpartyId: dto.counterpartyId ?? null,
          sourceCampaignId: dto.sourceCampaignId ?? null,
          enterpriseId: dto.enterpriseId ?? null,
          notes: dto.notes ?? null,
        },
      });
    });
  }

  async update(id: string, companyId: string, userId: string, dto: UpdateAccountDto) {
    await this.getAccountOrThrow(id, companyId);
    // Linking a counterparty is company-scoped and validated; unlinking (null) is
    // free. We never create a counterparty from this module.
    if (dto.counterpartyId) {
      await this.assertCounterpartyInCompany(dto.counterpartyId, companyId);
    }
    // MKT-006 — a NON-NULL attribution is validated company-scoped; clearing to null
    // (or omitting) is always allowed.
    if (dto.sourceCampaignId) {
      await this.assertCampaignInCompany(dto.sourceCampaignId, companyId);
    }
    // COM-018 — a NON-NULL enterprise link is validated (company + active); null clears it.
    if (dto.enterpriseId) {
      await this.assertEnterpriseActiveInCompany(dto.enterpriseId, companyId);
    }
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const data: Prisma.AccountUncheckedUpdateInput = { ...dto };
      return tx.account.update({ where: { id }, data });
    });
  }

  /** Soft-deactivate — set status INACTIVA (the lifecycle already models it).
   * Accounts are referenced by opportunities in later COM tickets, so V1 never
   * hard-deletes. */
  async deactivate(id: string, companyId: string, userId: string) {
    await this.getAccountOrThrow(id, companyId);
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.account.update({ where: { id }, data: { status: AccountStatus.INACTIVA } });
    });
  }

  /** Company-scoped existence check for a counterparty link. Rejects a link to a
   * counterparty that does not exist OR belongs to another company. Does NOT
   * create anything — account↔counterparty stays decoupled. */
  private async assertCounterpartyInCompany(counterpartyId: string, companyId: string) {
    const cp = await this.prisma.counterparty.findFirst({
      where: { id: counterpartyId, companyId },
      select: { id: true },
    });
    if (!cp) {
      throw new BadRequestException('Contraparte no encontrada en esta empresa.');
    }
  }

  /** MKT-006 — company-scoped existence check for a "Campaña de origen" attribution, via
   * the Marketing-exported lookup (NOT a direct campaigns query). A null result means the
   * campaign does not exist OR belongs to another company — both rejected with the same
   * clear message (the FK alone never checks tenant). */
  private async assertCampaignInCompany(campaignId: string, companyId: string) {
    const campaign = await this.campaignLookup.getForCompany(companyId, campaignId);
    if (!campaign) {
      throw new BadRequestException('Campaña de origen no encontrada en esta empresa.');
    }
  }

  /** COM-018 — company-scoped existence + active check for a parent-enterprise link. A
   * foreign, missing or INACTIVE enterprise is rejected with the same message (the FK
   * alone never checks tenant). Existing links to a later-deactivated enterprise are kept. */
  private async assertEnterpriseActiveInCompany(enterpriseId: string, companyId: string) {
    const enterprise = await this.prisma.enterprise.findFirst({
      where: { id: enterpriseId, companyId, isActive: true },
      select: { id: true },
    });
    if (!enterprise) {
      throw new BadRequestException('La empresa indicada no existe o está inactiva.');
    }
  }
}
