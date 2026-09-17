import { Module } from '@nestjs/common';
import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';

/* ALERT-001 — Comercial alerts feature module. Imports OpportunitiesModule (which EXPORTS
   OpportunitiesService) to reuse COM-020's lastMovementByOpportunity — one implementation
   of the derivation. PrismaService / PoliciesGuard / CaslAbilityFactory come from the
   global modules. No writes, so no RlsService. */
@Module({
  imports: [OpportunitiesModule],
  controllers: [AlertsController],
  providers: [AlertsService],
})
export class AlertsModule {}
