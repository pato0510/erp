import { Module } from '@nestjs/common';
import { AttributionReadModule } from '../comercial/attribution-read/attribution-read.module';
import { CampaignsModule } from '../marketing/campaigns/campaigns.module';
import { CashflowController } from './cashflow.controller';
import { CashflowService } from './cashflow.service';

/* MKT-007b — imports AttributionReadModule (opportunity origin) + Marketing's
   CampaignsModule (CampaignLookupService, campaign name) for the commitment DETAIL
   "Origen del negocio". Both point toward leaves → acyclic, no forwardRef. */
@Module({
  imports: [AttributionReadModule, CampaignsModule],
  controllers: [CashflowController],
  providers: [CashflowService],
  exports: [CashflowService],
})
export class CashflowModule {}
