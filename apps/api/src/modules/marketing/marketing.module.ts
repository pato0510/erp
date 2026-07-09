import { Module } from '@nestjs/common';
import { MarketingController } from './marketing.controller';

/* MKT-001 — Marketing module aggregator (mirrors the COM-001 scaffold). This
 * ticket ships the module shell only: a guarded ping + the permissions endpoint,
 * no data model and no CRUD. Feature submodules (campaigns, expenses, presence)
 * are imported here as their tickets land (MKT-002+), the same way ComercialModule
 * aggregates its feature submodules. PoliciesGuard / CaslAbilityFactory /
 * PrismaService are provided by the global Casl/Prisma modules — never per-module. */
@Module({
  controllers: [MarketingController],
})
export class MarketingModule {}
