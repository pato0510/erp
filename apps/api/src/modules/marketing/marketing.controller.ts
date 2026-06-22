import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CalendarItemStatus, CalendarItemType } from '@prisma/client';
import { CurrentCompany } from '../common/decorators/current-company.decorator';
import { JwtAuthGuard } from '../iam/guards/jwt-auth.guard';
import { CampaignsService } from './campaigns.service';
import { CalendarItemsService } from './calendar-items.service';
import { CampaignTasksService } from './campaign-tasks.service';
import { MarketingDashboardService } from './dashboard.service';
import { ExpensesService } from './expenses.service';
import { FinanceCategoriesService } from './finance-categories.service';
import { SeoService } from './seo.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { CreateCalendarItemDto } from './dto/create-calendar-item.dto';
import { UpdateCalendarItemDto } from './dto/update-calendar-item.dto';
import { RescheduleCalendarItemDto } from './dto/reschedule-calendar-item.dto';
import { CreateCampaignTaskDto } from './dto/create-campaign-task.dto';
import { UpdateCampaignTaskDto } from './dto/update-campaign-task.dto';

/**
 * MARKETING (DEMO) — single controller, base path `/marketing` (served at
 * `/api/marketing/...`). Mirrors the RRHH posture: JwtAuthGuard only, company
 * resolved from the x-company-id header via @CurrentCompany(). Every query is
 * companyId-scoped in the services. CASL/RLS/audit are out of scope (demo).
 *
 * Route ordering note: all static sub-paths (dashboard, expenses, seo,
 * finance-categories, calendar-items, campaign-tasks) are declared BEFORE the
 * `campaigns/:id` family. The Marketing ROI tile fetches Comercial's
 * `/api/comercial/campaign-roi` — NOT defined here (left intact).
 */
@Controller('marketing')
@UseGuards(JwtAuthGuard)
export class MarketingController {
  constructor(
    private readonly dashboard: MarketingDashboardService,
    private readonly campaigns: CampaignsService,
    private readonly calendarItems: CalendarItemsService,
    private readonly campaignTasks: CampaignTasksService,
    private readonly expenses: ExpensesService,
    private readonly seo: SeoService,
    private readonly financeCategories: FinanceCategoriesService,
  ) {}

  /* ── Dashboard ─────────────────────────────────────────────────── */

  @Get('dashboard')
  getDashboard(@CurrentCompany() companyId: string) {
    return this.dashboard.getDashboard(companyId);
  }

  /* ── Gastos ────────────────────────────────────────────────────── */

  @Get('expenses')
  listExpenses(@CurrentCompany() companyId: string) {
    return this.expenses.findAll(companyId);
  }

  @Post('expenses')
  createExpense(@CurrentCompany() companyId: string, @Body() dto: CreateExpenseDto) {
    return this.expenses.create(companyId, dto);
  }

  @Delete('expenses/:id')
  removeExpense(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.expenses.remove(id, companyId);
  }

  /* ── SEO ───────────────────────────────────────────────────────── */

  @Get('seo')
  listSeo(@CurrentCompany() companyId: string) {
    return this.seo.findAll(companyId);
  }

  /* ── Finance categories (read-only passthrough) ────────────────── */

  @Get('finance-categories')
  listFinanceCategories(@CurrentCompany() companyId: string) {
    return this.financeCategories.findAll(companyId);
  }

  /* ── Calendar items (multi-type operational board) ─────────────── */

  @Get('calendar-items')
  listCalendarItems(
    @CurrentCompany() companyId: string,
    @Query('type') type?: CalendarItemType,
    @Query('channel') channel?: string,
    @Query('owner') owner?: string,
    @Query('status') status?: CalendarItemStatus,
    @Query('serviceId') serviceId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.calendarItems.findAll(companyId, {
      type,
      channel,
      owner,
      status,
      serviceId,
      from,
      to,
    });
  }

  @Post('calendar-items')
  createCalendarItem(
    @CurrentCompany() companyId: string,
    @Body() dto: CreateCalendarItemDto,
  ) {
    return this.calendarItems.create(companyId, dto);
  }

  @Get('calendar-items/:id')
  getCalendarItem(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.calendarItems.findOne(id, companyId);
  }

  @Patch('calendar-items/:id/reschedule')
  rescheduleCalendarItem(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Body() dto: RescheduleCalendarItemDto,
  ) {
    return this.calendarItems.reschedule(id, companyId, dto);
  }

  @Patch('calendar-items/:id')
  updateCalendarItem(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Body() dto: UpdateCalendarItemDto,
  ) {
    return this.calendarItems.update(id, companyId, dto);
  }

  @Delete('calendar-items/:id')
  removeCalendarItem(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.calendarItems.remove(id, companyId);
  }

  /* ── Campaign tasks ────────────────────────────────────────────── */

  @Get('campaign-tasks')
  listCampaignTasks(
    @CurrentCompany() companyId: string,
    @Query('campaignId') campaignId?: string,
  ) {
    return this.campaignTasks.findAll(companyId, campaignId);
  }

  @Post('campaign-tasks')
  createCampaignTask(
    @CurrentCompany() companyId: string,
    @Body() dto: CreateCampaignTaskDto,
  ) {
    return this.campaignTasks.create(companyId, dto);
  }

  @Patch('campaign-tasks/:id')
  updateCampaignTask(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Body() dto: UpdateCampaignTaskDto,
  ) {
    return this.campaignTasks.update(id, companyId, dto);
  }

  @Delete('campaign-tasks/:id')
  removeCampaignTask(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.campaignTasks.remove(id, companyId);
  }

  /* ── Campañas — CRUD (declare static routes above before :id) ──── */

  @Get('campaigns')
  listCampaigns(@CurrentCompany() companyId: string) {
    return this.campaigns.findAll(companyId);
  }

  @Post('campaigns')
  createCampaign(@CurrentCompany() companyId: string, @Body() dto: CreateCampaignDto) {
    return this.campaigns.create(companyId, dto);
  }

  @Get('campaigns/:id')
  getCampaign(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.campaigns.findOne(id, companyId);
  }

  @Patch('campaigns/:id')
  updateCampaign(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    return this.campaigns.update(id, companyId, dto);
  }

  @Delete('campaigns/:id')
  removeCampaign(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.campaigns.remove(id, companyId);
  }
}
