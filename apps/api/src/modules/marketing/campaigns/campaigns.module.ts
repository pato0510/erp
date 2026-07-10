import { Module } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';

/* MKT-002 — campaigns feature module (Marketing core). PrismaService / RlsService /
   PoliciesGuard / CaslAbilityFactory come from the global modules; only the
   controller + service are provided here. Exported so later Marketing modules
   (expenses in MKT-005, ROI in MKT-007) and the CampaignLookupService (MKT-006) can
   reuse the service. */
@Module({
  controllers: [CampaignsController],
  providers: [CampaignsService],
  exports: [CampaignsService],
})
export class CampaignsModule {}
