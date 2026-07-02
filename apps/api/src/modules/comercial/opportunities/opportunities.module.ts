import { Module } from '@nestjs/common';
import { OpportunitiesController } from './opportunities.controller';
import { OpportunitiesService } from './opportunities.service';

/* COM-005 — opportunities feature module (the pipeline core). PrismaService /
   RlsService / PoliciesGuard / CaslAbilityFactory come from the global modules;
   only the controller + service are provided here. Exported so later Comercial
   modules (activities, quotes, the GANADA handoff) can reuse the service. */
@Module({
  controllers: [OpportunitiesController],
  providers: [OpportunitiesService],
  exports: [OpportunitiesService],
})
export class OpportunitiesModule {}
