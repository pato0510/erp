import { Module } from '@nestjs/common';
import { OpportunitiesController } from './opportunities.controller';
import { OpportunitiesService } from './opportunities.service';
import { OpportunityServicesController } from './opportunity-services/opportunity-services.controller';
import { OpportunityServicesService } from './opportunity-services/opportunity-services.service';

/* COM-005 — opportunities feature module (the pipeline core). COM-006 adds the
   opportunity_services bundle as a SUB-RESOURCE (…/opportunities/:id/services),
   registered here (not a sibling module) since the bundle is part of the opportunity
   and reuses OpportunitySubject. PrismaService / RlsService / PoliciesGuard /
   CaslAbilityFactory come from the global modules; only the controllers + services
   are provided here. Exported so later Comercial modules (activities, quotes, the
   GANADA handoff) can reuse them. */
@Module({
  controllers: [OpportunitiesController, OpportunityServicesController],
  providers: [OpportunitiesService, OpportunityServicesService],
  exports: [OpportunitiesService, OpportunityServicesService],
})
export class OpportunitiesModule {}
