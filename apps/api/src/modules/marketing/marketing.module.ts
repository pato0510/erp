import { Module } from '@nestjs/common';
import { CampaignsModule } from './campaigns/campaigns.module';
import { MarketingController } from './marketing.controller';

/* MKT-001 — Marketing module aggregator (mirrors the COM-001 scaffold). Ships the
 * module shell (guarded ping + permissions endpoint) and composes feature submodules
 * as their tickets land (MKT-002+), the same way ComercialModule aggregates its
 * feature submodules. MKT-002 adds CampaignsModule (the campaigns core). PoliciesGuard
 * / CaslAbilityFactory / PrismaService are provided by the global Casl/Prisma modules
 * — never per-module. */
@Module({
  imports: [CampaignsModule],
  controllers: [MarketingController],
})
export class MarketingModule {}
