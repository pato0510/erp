import { Module } from '@nestjs/common';
import { AttributionReadModule } from '../../comercial/attribution-read/attribution-read.module';
import { CampaignLookupService } from './campaign-lookup.service';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { ExpensesController } from './expenses/expenses.controller';
import { ExpensesService } from './expenses/expenses.service';

/* MKT-002 — campaigns feature module (Marketing core). MKT-005 adds the expenses
   ledger as a SUB-RESOURCE. MKT-006 adds the attribution contract (Part 1 §4):
   - EXPORTS CampaignLookupService (consumed by Comercial's AccountsModule for
     attribution validation + name enrichment).
   - IMPORTS Comercial's AttributionReadModule (AccountAttributionReadService) for the
     campaign delete guard (zero attributed accounts).
   Module graph stays ACYCLIC — Accounts → Campaigns → AttributionRead — no forwardRef.
   PrismaService / RlsService / PoliciesGuard / CaslAbilityFactory come from the global
   modules. */
@Module({
  imports: [AttributionReadModule],
  controllers: [CampaignsController, ExpensesController],
  providers: [CampaignsService, ExpensesService, CampaignLookupService],
  exports: [CampaignsService, CampaignLookupService],
})
export class CampaignsModule {}
