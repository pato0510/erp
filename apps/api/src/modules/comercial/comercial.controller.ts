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
import {
  CrmLeadPriority,
  CrmLeadSource,
  CrmLeadStatus,
  ServiceCategory,
} from '@prisma/client';
import { CurrentCompany } from '../common/decorators/current-company.decorator';
import { JwtAuthGuard } from '../iam/guards/jwt-auth.guard';
import { ActivitiesService } from './activities.service';
import { CampaignRoiService } from './campaign-roi.service';
import { ClientsService } from './clients.service';
import { ComercialDashboardService } from './dashboard.service';
import { LeadsService } from './leads.service';
import { OpportunitiesService } from './opportunities.service';
import { QuotesService } from './quotes.service';
import { ServiceCatalogService } from './service-catalog.service';
import { StagesService } from './stages.service';
import { ConvertLeadDto } from './dto/convert-lead.dto';
import { CreateActivityDto } from './dto/create-activity.dto';
import { CreateLeadDto } from './dto/create-lead.dto';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { CreateQuoteItemDto } from './dto/create-quote-item.dto';
import { CreateServiceDto } from './dto/create-service.dto';
import { MoveStageDto } from './dto/move-stage.dto';
import { QuoteStatusDto } from './dto/quote-status.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

/**
 * COMERCIAL / CRM (DEMO) — single controller, base path `/comercial` (served at
 * `/api/comercial/...`). Mirrors the Marketing/RRHH posture: JwtAuthGuard only,
 * company resolved from the x-company-id header via @CurrentCompany(). Every
 * query is companyId-scoped in the services. CASL/RLS/audit are out of scope
 * (demo).
 *
 * Route ordering note: every STATIC sub-path (dashboard, stages, clients,
 * leads, service-catalog, quotes, activities, campaign-roi, and the
 * opportunities collection routes) is declared BEFORE its respective `:id`
 * family so `:id` never shadows them.
 */
@Controller('comercial')
@UseGuards(JwtAuthGuard)
export class ComercialController {
  constructor(
    private readonly dashboard: ComercialDashboardService,
    private readonly stages: StagesService,
    private readonly clients: ClientsService,
    private readonly opportunities: OpportunitiesService,
    private readonly activities: ActivitiesService,
    private readonly campaignRoi: CampaignRoiService,
    private readonly leads: LeadsService,
    private readonly serviceCatalog: ServiceCatalogService,
    private readonly quotes: QuotesService,
  ) {}

  /* ── Dashboard ─────────────────────────────────────────────────── */

  @Get('dashboard')
  getDashboard(@CurrentCompany() companyId: string) {
    return this.dashboard.getDashboard(companyId);
  }

  /* ── Stages ────────────────────────────────────────────────────── */

  @Get('stages')
  listStages(@CurrentCompany() companyId: string) {
    return this.stages.findAll(companyId);
  }

  /* ── Marketing ROI bridge ──────────────────────────────────────── */

  @Get('campaign-roi')
  getCampaignRoi(@CurrentCompany() companyId: string) {
    return this.campaignRoi.getRoi(companyId);
  }

  /* ── Clients (read from Finance Counterparty type=CLIENT) ──────── */

  @Get('clients')
  listClients(@CurrentCompany() companyId: string) {
    return this.clients.findAll(companyId);
  }

  @Get('clients/:id')
  getClient(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.clients.findOne(id, companyId);
  }

  /* ── Leads ─────────────────────────────────────────────────────── */

  @Get('leads')
  listLeads(
    @CurrentCompany() companyId: string,
    @Query('status') status?: CrmLeadStatus,
    @Query('source') source?: CrmLeadSource,
    @Query('priority') priority?: CrmLeadPriority,
    @Query('owner') owner?: string,
  ) {
    return this.leads.findAll(companyId, { status, source, priority, owner });
  }

  @Post('leads')
  createLead(@CurrentCompany() companyId: string, @Body() dto: CreateLeadDto) {
    return this.leads.create(companyId, dto);
  }

  @Get('leads/:id')
  getLead(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.leads.findOne(id, companyId);
  }

  @Post('leads/:id/convert')
  convertLead(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Body() dto: ConvertLeadDto,
  ) {
    return this.leads.convert(id, companyId, dto);
  }

  @Patch('leads/:id')
  updateLead(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Body() dto: UpdateLeadDto,
  ) {
    return this.leads.update(id, companyId, dto);
  }

  @Delete('leads/:id')
  removeLead(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.leads.remove(id, companyId);
  }

  /* ── Service catalog ───────────────────────────────────────────── */

  @Get('service-catalog')
  listServices(
    @CurrentCompany() companyId: string,
    @Query('category') category?: ServiceCategory,
  ) {
    return this.serviceCatalog.findAll(companyId, category);
  }

  @Post('service-catalog')
  createService(@CurrentCompany() companyId: string, @Body() dto: CreateServiceDto) {
    return this.serviceCatalog.create(companyId, dto);
  }

  @Patch('service-catalog/:id')
  updateService(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Body() dto: UpdateServiceDto,
  ) {
    return this.serviceCatalog.update(id, companyId, dto);
  }

  @Delete('service-catalog/:id')
  removeService(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.serviceCatalog.remove(id, companyId);
  }

  /* ── Quotes ────────────────────────────────────────────────────── */

  @Get('quotes')
  listQuotes(@CurrentCompany() companyId: string) {
    return this.quotes.findAll(companyId);
  }

  @Post('quotes')
  createQuote(@CurrentCompany() companyId: string, @Body() dto: CreateQuoteDto) {
    return this.quotes.create(companyId, dto);
  }

  @Get('quotes/:id')
  getQuote(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.quotes.findOne(id, companyId);
  }

  @Post('quotes/:id/items')
  addQuoteItem(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Body() dto: CreateQuoteItemDto,
  ) {
    return this.quotes.addItem(id, companyId, dto);
  }

  @Delete('quotes/:id/items/:itemId')
  removeQuoteItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentCompany() companyId: string,
  ) {
    return this.quotes.removeItem(id, itemId, companyId);
  }

  @Patch('quotes/:id/status')
  changeQuoteStatus(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Body() dto: QuoteStatusDto,
  ) {
    return this.quotes.changeStatus(id, companyId, dto.status);
  }

  @Patch('quotes/:id')
  updateQuote(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Body() dto: UpdateQuoteDto,
  ) {
    return this.quotes.update(id, companyId, dto);
  }

  @Delete('quotes/:id')
  removeQuote(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.quotes.remove(id, companyId);
  }

  /* ── Activities (static routes; declared before opportunities/:id) ── */

  @Get('activities')
  listActivities(
    @CurrentCompany() companyId: string,
    @Query('opportunityId') opportunityId?: string,
    @Query('counterpartyId') counterpartyId?: string,
    @Query('leadId') leadId?: string,
  ) {
    return this.activities.findAll(companyId, { opportunityId, counterpartyId, leadId });
  }

  @Post('activities')
  createActivity(@CurrentCompany() companyId: string, @Body() dto: CreateActivityDto) {
    return this.activities.create(companyId, dto);
  }

  @Patch('activities/:id')
  updateActivity(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Body() dto: UpdateActivityDto,
  ) {
    return this.activities.update(id, companyId, dto);
  }

  @Delete('activities/:id')
  removeActivity(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.activities.remove(id, companyId);
  }

  /* ── Opportunities — CRUD + move-stage ─────────────────────────── */

  @Get('opportunities')
  listOpportunities(@CurrentCompany() companyId: string) {
    return this.opportunities.findAll(companyId);
  }

  @Post('opportunities')
  createOpportunity(@CurrentCompany() companyId: string, @Body() dto: CreateOpportunityDto) {
    return this.opportunities.create(companyId, dto);
  }

  @Get('opportunities/:id')
  getOpportunity(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.opportunities.findOne(id, companyId);
  }

  @Patch('opportunities/:id/move-stage')
  moveStage(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Body() dto: MoveStageDto,
  ) {
    return this.opportunities.moveStage(id, companyId, dto.stageId);
  }

  @Patch('opportunities/:id')
  updateOpportunity(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Body() dto: UpdateOpportunityDto,
  ) {
    return this.opportunities.update(id, companyId, dto);
  }

  @Delete('opportunities/:id')
  removeOpportunity(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.opportunities.remove(id, companyId);
  }
}
