import { Module } from '@nestjs/common';
import { ComercialController } from './comercial.controller';
import { ActivitiesService } from './activities.service';
import { CampaignRoiService } from './campaign-roi.service';
import { ClientsService } from './clients.service';
import { ComercialDashboardService } from './dashboard.service';
import { LeadsService } from './leads.service';
import { OpportunitiesService } from './opportunities.service';
import { QuotesService } from './quotes.service';
import { ServiceCatalogService } from './service-catalog.service';
import { StagesService } from './stages.service';

/**
 * COMERCIAL / CRM (DEMO) — shared foundation module. PrismaModule is @Global, so
 * PrismaService is injected directly. No RLS/CASL wiring (demo scope). Finance
 * (Counterparty, TaxDocument) and Marketing (MarketingCampaign) are only READ —
 * never mutated. The "won opp → Finanzas commitment" link is SIMULATED on the
 * CrmOpportunity row (no real Commitment, no domain event).
 */
@Module({
  controllers: [ComercialController],
  providers: [
    ComercialDashboardService,
    StagesService,
    ClientsService,
    OpportunitiesService,
    ActivitiesService,
    CampaignRoiService,
    LeadsService,
    ServiceCatalogService,
    QuotesService,
  ],
  exports: [OpportunitiesService, ActivitiesService],
})
export class ComercialModule {}
