import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

/* COM-019 — Comercial dashboard feature module. PrismaService / PoliciesGuard /
   CaslAbilityFactory come from the global modules; only the controller + service live
   here. No writes, so no RlsService. */
@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
