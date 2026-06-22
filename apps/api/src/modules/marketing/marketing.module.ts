import { Module } from '@nestjs/common';
import { MarketingController } from './marketing.controller';
import { CampaignsService } from './campaigns.service';
import { CalendarItemsService } from './calendar-items.service';
import { CampaignTasksService } from './campaign-tasks.service';
import { MarketingDashboardService } from './dashboard.service';
import { ExpensesService } from './expenses.service';
import { FinanceCategoriesService } from './finance-categories.service';
import { SeoService } from './seo.service';

/**
 * MARKETING (DEMO) — shared foundation module. PrismaModule is @Global, so
 * PrismaService is injected directly. No RLS/CASL wiring (demo scope). Finance
 * and Comercial are only READ (FinanceCategoriesService, plus the dashboard /
 * campaign-detail CRM cross-reads) — never mutated.
 */
@Module({
  controllers: [MarketingController],
  providers: [
    MarketingDashboardService,
    CampaignsService,
    CalendarItemsService,
    CampaignTasksService,
    ExpensesService,
    SeoService,
    FinanceCategoriesService,
  ],
  exports: [CampaignsService, ExpensesService],
})
export class MarketingModule {}
