import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RlsService } from '../../../common/rls/rls.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';

/* MKT-005 — the campaign's expense ledger, as a SUB-RESOURCE of campaigns
 * (…/campaigns/:campaignId/expenses). It reuses the MarketingExpense CASL subject (the
 * controller gates read vs create/update/delete). INFORMATIONAL ONLY: this service
 * NEVER touches Finanzas — no Movement, no Commitment, no domain event (Part 1 §2.2/§4).
 *
 * BUSINESS RULE (V1): expense CRUD is INDEPENDENT of campaign status. Late invoices on
 * a FINALIZADA campaign are real, and corrections must always be possible — so expenses
 * can be added/edited/deleted regardless of whether the campaign is BORRADOR, ACTIVA,
 * PAUSADA, FINALIZADA or CANCELADA. (Contrast the campaign's own closed-state edit
 * guard, which only blocks editing the campaign's OWN fields.) */
@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  /** Anchor a YYYY-MM-DD (or ISO) string to UTC midnight so an @db.Date column never
   * suffers the timezone off-by-one (the RRHH HR-004b convention). */
  private toDateOnly(dateStr: string): Date {
    const d = new Date(dateStr);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  async findAll(companyId: string, campaignId: string) {
    await this.assertCampaignInCompany(campaignId, companyId);
    return this.prisma.marketingExpense.findMany({
      where: { companyId, campaignId },
      orderBy: [{ expenseDate: 'desc' }],
    });
  }

  async create(companyId: string, userId: string, campaignId: string, dto: CreateExpenseDto) {
    await this.assertCampaignInCompany(campaignId, companyId);
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.marketingExpense.create({
        data: {
          companyId,
          campaignId,
          createdBy: userId,
          expenseDate: this.toDateOnly(dto.expenseDate),
          description: dto.description,
          amount: new Prisma.Decimal(dto.amount),
          vendorName: dto.vendorName ?? null,
          notes: dto.notes ?? null,
        },
      });
    });
  }

  async update(
    companyId: string,
    userId: string,
    campaignId: string,
    id: string,
    dto: UpdateExpenseDto,
  ) {
    await this.assertCampaignInCompany(campaignId, companyId);
    await this.findExpense(id, companyId, campaignId);

    const data: Prisma.MarketingExpenseUncheckedUpdateInput = {};
    if (dto.expenseDate !== undefined) data.expenseDate = this.toDateOnly(dto.expenseDate);
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.amount !== undefined) data.amount = new Prisma.Decimal(dto.amount);
    if (dto.vendorName !== undefined) data.vendorName = dto.vendorName ?? null;
    if (dto.notes !== undefined) data.notes = dto.notes ?? null;

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.marketingExpense.update({ where: { id }, data });
    });
  }

  async remove(companyId: string, userId: string, campaignId: string, id: string) {
    await this.assertCampaignInCompany(campaignId, companyId);
    await this.findExpense(id, companyId, campaignId);
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      await tx.marketingExpense.delete({ where: { id } });
      return { id, deleted: true };
    });
  }

  /** The parent campaign must exist AND be in this company (never leak across tenants). */
  private async assertCampaignInCompany(campaignId: string, companyId: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, companyId },
      select: { id: true },
    });
    if (!campaign) throw new NotFoundException('Campaña no encontrada');
    return campaign;
  }

  /** Company- AND campaign-scoped expense lookup (the expense must belong to :campaignId). */
  private async findExpense(id: string, companyId: string, campaignId: string) {
    const expense = await this.prisma.marketingExpense.findFirst({
      where: { id, companyId, campaignId },
    });
    if (!expense) throw new NotFoundException('Gasto no encontrado');
    return expense;
  }
}
