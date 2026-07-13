import { Module } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { ExpensesController } from './expenses/expenses.controller';
import { ExpensesService } from './expenses/expenses.service';

/* MKT-002 — campaigns feature module (Marketing core). MKT-005 adds the expenses
   ledger as a SUB-RESOURCE (…/campaigns/:campaignId/expenses), registered HERE (not a
   sibling module) since expenses are part of the campaign and reuse the MarketingExpense
   subject — same precedent as OpportunitiesModule registering its service bundle.
   PrismaService / RlsService / PoliciesGuard / CaslAbilityFactory come from the global
   modules. Exported so later Marketing modules (ROI in MKT-007) and the
   CampaignLookupService (MKT-006) can reuse the campaigns service. */
@Module({
  controllers: [CampaignsController, ExpensesController],
  providers: [CampaignsService, ExpensesService],
  exports: [CampaignsService],
})
export class CampaignsModule {}
