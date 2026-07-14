import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CommitmentStatus, MovementStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { RlsService } from '../common/rls/rls.service';
import { paginate } from '@erp/utils';
import {
  AppAbility,
  CampaignSubject,
  OpportunitySubject,
} from '../common/casl/casl-ability.factory';
import {
  AccountAttributionReadService,
  BusinessOrigin,
} from '../comercial/attribution-read/attribution-read.service';
import { CampaignLookupService } from '../marketing/campaigns/campaign-lookup.service';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { SetOpeningBalanceDto } from './dto/set-opening-balance.dto';
import { CreateCommitmentDto } from './dto/create-commitment.dto';
import { FilterCommitmentDto } from './dto/filter-commitment.dto';

/* MKT-007b — the sourceType stamped by the Finanzas COM-014 listener on an
   opportunity-won commitment (finance/opportunity-commitment.listener.ts). Only these
   commitments are opportunity-born and carry an origin; manual/SII commitments do not. */
const OPPORTUNITY_WON_SOURCE_TYPE = 'comercial_opportunity_won';

@Injectable()
export class CashflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
    // MKT-007b — Comercial's exposed reader (origin) + Marketing's lookup (campaign name).
    // Cashflow reads NO Comercial/Marketing tables directly; both go through DI.
    private readonly attributionRead: AccountAttributionReadService,
    private readonly campaignLookup: CampaignLookupService,
  ) {}

  /* MKT-007b — commitment DETAIL, enriched with the ability-shaped "Origen del negocio".
     Origin is composed ONLY for a commitment born from a Comercial opportunity (sourceType
     = comercial_opportunity_won, sourceId = opportunityId) — manual/SII commitments get
     origin: null (conditional #1). The campaign part resolves only when the account has a
     source campaign AND the caller can read Campaign. Zero role strings. */
  async findCommitment(id: string, companyId: string, ability: AppAbility) {
    const commitment = await this.prisma.commitment.findFirst({
      where: { id, companyId },
      include: {
        counterparty: { select: { name: true } },
        category: { select: { name: true } },
      },
    });
    if (!commitment) throw new NotFoundException('Compromiso no encontrado');
    const opportunityId =
      commitment.sourceType === OPPORTUNITY_WON_SOURCE_TYPE ? commitment.sourceId : null;
    const origin = await this.composeOrigin(companyId, opportunityId, ability);
    return { ...commitment, origin };
  }

  private async composeOrigin(
    companyId: string,
    opportunityId: string | null,
    ability: AppAbility,
  ): Promise<BusinessOrigin | null> {
    if (!opportunityId || !ability.can('read', OpportunitySubject)) return null;
    const origin = await this.attributionRead.getOpportunityOrigin(companyId, opportunityId);
    if (!origin) return null;
    let campaign: { id: string; name: string } | null = null;
    if (origin.sourceCampaignId && ability.can('read', CampaignSubject)) {
      const c = await this.campaignLookup.getForCompany(companyId, origin.sourceCampaignId);
      campaign = c ? { id: c.id, name: c.name } : null;
    }
    return {
      opportunity: { id: origin.opportunityId, name: origin.opportunityName },
      account: { id: origin.accountId, name: origin.accountName },
      campaign,
    };
  }

  // ── Bank Accounts ──────────────────────────────────────

  async createAccount(companyId: string, userId: string, dto: CreateBankAccountDto) {
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.bankAccount.create({
        data: { ...dto, companyId },
      });
    });
  }

  async findAccounts(companyId: string) {
    return this.prisma.bankAccount.findMany({
      where: { companyId, isActive: true },
      include: { balances: { orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: { name: 'asc' },
    });
  }

  async deleteAccount(id: string, companyId: string, userId: string) {
    const account = await this.prisma.bankAccount.findFirst({
      where: { id, companyId },
    });
    if (!account) throw new NotFoundException('Cuenta bancaria no encontrada');

    // Movement has no direct link to BankAccount — the proxy for "confirmed movements"
    // is ExternalBankMovement rows imported via any BankConnection tied to this account.
    const connections = await this.prisma.bankConnection.findMany({
      where: { bankAccountId: id, companyId },
      select: { id: true },
    });

    if (connections.length > 0) {
      const movementCount = await this.prisma.externalBankMovement.count({
        where: { bankConnectionId: { in: connections.map((c) => c.id) } },
      });
      if (movementCount > 0) {
        throw new BadRequestException(
          'No se puede eliminar una cuenta con movimientos confirmados. Desactívala en su lugar.',
        );
      }
    }

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      await tx.accountBalance.deleteMany({ where: { bankAccountId: id, companyId } });

      if (connections.length > 0) {
        const connectionIds = connections.map((c) => c.id);
        await tx.bankSyncRun.deleteMany({
          where: { bankConnectionId: { in: connectionIds } },
        });
        await tx.bankConnection.deleteMany({
          where: { bankAccountId: id, companyId },
        });
      }

      return tx.bankAccount.delete({ where: { id } });
    });
  }

  async setOpeningBalance(companyId: string, userId: string, dto: SetOpeningBalanceDto) {
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.accountBalance.upsert({
        where: {
          bankAccountId_fiscalPeriodId: {
            bankAccountId: dto.bankAccountId,
            fiscalPeriodId: dto.fiscalPeriodId,
          },
        },
        update: { openingBalance: dto.openingBalance, setBy: userId },
        create: {
          companyId,
          bankAccountId: dto.bankAccountId,
          fiscalPeriodId: dto.fiscalPeriodId,
          openingBalance: dto.openingBalance,
          setBy: userId,
        },
      });
    });
  }

  // ── Cash Position ──────────────────────────────────────

  async getConsolidatedCash(companyId: string, fiscalPeriodId: string) {
    const [balances, incomeResult, expenseResult] = await Promise.all([
      this.prisma.accountBalance.findMany({
        where: { companyId, fiscalPeriodId },
        include: { bankAccount: { select: { name: true, type: true } } },
      }),
      this.prisma.movement.aggregate({
        where: { companyId, fiscalPeriodId, type: 'INCOME', status: MovementStatus.CONFIRMED },
        _sum: { amount: true },
      }),
      this.prisma.movement.aggregate({
        where: { companyId, fiscalPeriodId, type: 'EXPENSE', status: MovementStatus.CONFIRMED },
        _sum: { amount: true },
      }),
    ]);

    const openingBalance = balances.reduce((sum, b) => sum + Number(b.openingBalance), 0);
    const totalIncome = Number(incomeResult._sum.amount || 0);
    const totalExpense = Number(expenseResult._sum.amount || 0);
    const totalCash = openingBalance + totalIncome - totalExpense;

    return {
      totalCash,
      openingBalance,
      totalIncome,
      totalExpense,
      byAccount: balances.map((b) => ({
        accountName: b.bankAccount.name,
        accountType: b.bankAccount.type,
        openingBalance: Number(b.openingBalance),
      })),
      fiscalPeriodId,
    };
  }

  async getFreeCash(companyId: string, fiscalPeriodId: string) {
    const position = await this.getConsolidatedCash(companyId, fiscalPeriodId);

    const pendingCommitments = await this.prisma.commitment.findMany({
      where: { companyId, fiscalPeriodId, status: CommitmentStatus.PENDING },
      orderBy: { dueDate: 'asc' },
    });

    const committedAmount = pendingCommitments.reduce((sum, c) => sum + Number(c.amount), 0);

    return {
      totalCash: position.totalCash,
      committedAmount,
      freeCash: position.totalCash - committedAmount,
      commitments: pendingCommitments.map((c) => ({
        id: c.id,
        description: c.description,
        amount: Number(c.amount),
        dueDate: c.dueDate,
        type: c.type,
      })),
    };
  }

  // ── Commitments ────────────────────────────────────────

  async findCommitments(companyId: string, filters: FilterCommitmentDto) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.CommitmentWhereInput = { companyId };
    if (filters.status) where.status = filters.status;
    if (filters.type) where.type = filters.type;
    if (filters.dueDateFrom || filters.dueDateTo) {
      where.dueDate = {};
      if (filters.dueDateFrom) where.dueDate.gte = new Date(filters.dueDateFrom);
      if (filters.dueDateTo) where.dueDate.lte = new Date(filters.dueDateTo);
    }

    const [data, total] = await Promise.all([
      this.prisma.commitment.findMany({
        where,
        include: {
          counterparty: { select: { name: true } },
          category: { select: { name: true } },
        },
        skip,
        take: limit,
        orderBy: { dueDate: 'asc' },
      }),
      this.prisma.commitment.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async createCommitment(companyId: string, userId: string, dto: CreateCommitmentDto) {
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.commitment.create({
        data: {
          companyId,
          fiscalPeriodId: dto.fiscalPeriodId,
          counterpartyId: dto.counterpartyId,
          categoryId: dto.categoryId,
          type: dto.type,
          amount: dto.amount,
          dueDate: new Date(dto.dueDate),
          description: dto.description,
          notes: dto.notes,
        },
      });
    });
  }

  async markAsPaid(id: string, companyId: string, userId: string, movementId?: string) {
    const commitment = await this.prisma.commitment.findFirst({ where: { id, companyId } });
    if (!commitment) throw new NotFoundException('Commitment not found');

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.commitment.update({
        where: { id },
        data: {
          status: CommitmentStatus.PAID,
          paidAt: new Date(),
          paidBy: userId,
          movementId,
        },
      });
    });
  }

  async cancelCommitment(id: string, companyId: string, userId: string) {
    const commitment = await this.prisma.commitment.findFirst({ where: { id, companyId } });
    if (!commitment) throw new NotFoundException('Commitment not found');

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.commitment.update({
        where: { id },
        data: { status: CommitmentStatus.CANCELLED },
      });
    });
  }

  async getUpcoming(companyId: string, days = 30) {
    const now = new Date();
    const future = new Date();
    future.setDate(future.getDate() + days);

    return this.prisma.commitment.findMany({
      where: {
        companyId,
        status: CommitmentStatus.PENDING,
        dueDate: { gte: now, lte: future },
      },
      include: {
        counterparty: { select: { name: true } },
        category: { select: { name: true } },
      },
      orderBy: { dueDate: 'asc' },
    });
  }
}
