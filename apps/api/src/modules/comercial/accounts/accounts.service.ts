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

  async findAll(companyId: string, filters: ListFilters = {}) {
    const where: Prisma.AccountWhereInput = { companyId };
    if (filters.status) where.status = filters.status;
    if (filters.priority) where.priority = filters.priority;
    if (filters.search) where.name = { contains: filters.search, mode: 'insensitive' };
    return this.prisma.account.findMany({ where, orderBy: [{ name: 'asc' }] });
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
    return {
      ...account,
      sourceCampaign: campaign ? { id: campaign.id, name: campaign.name } : null,
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
}
