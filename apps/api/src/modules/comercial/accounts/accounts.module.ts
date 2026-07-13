import { Module } from '@nestjs/common';
import { CampaignsModule } from '../../marketing/campaigns/campaigns.module';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';

/* COM-003 — accounts feature module (CRM core). PrismaService / RlsService /
   PoliciesGuard / CaslAbilityFactory come from the global modules. MKT-006 — imports
   Marketing's CampaignsModule to consume CampaignLookupService (attribution validation
   + "Campaña de origen" name enrichment) via DI, so Comercial never queries the
   campaigns table directly. This is the top of the acyclic chain Accounts → Campaigns →
   AttributionRead. Exported so later Comercial modules reuse the accounts service. */
@Module({
  imports: [CampaignsModule],
  controllers: [AccountsController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}
