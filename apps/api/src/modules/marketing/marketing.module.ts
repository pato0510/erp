import { Module } from '@nestjs/common';
import { CampaignsModule } from './campaigns/campaigns.module';
import { PresenceModule } from './presence/presence.module';
import { MarketingController } from './marketing.controller';

/* MKT-001 — Marketing module aggregator (mirrors the COM-001 scaffold). Ships the
 * module shell (guarded ping + permissions endpoint) and composes feature submodules
 * as their tickets land: MKT-002 CampaignsModule (campaigns core), MKT-008 PresenceModule
 * (digital-presence snapshots). PoliciesGuard / CaslAbilityFactory / PrismaService are
 * provided by the global Casl/Prisma modules — never per-module. */
@Module({
  imports: [CampaignsModule, PresenceModule],
  controllers: [MarketingController],
})
export class MarketingModule {}
