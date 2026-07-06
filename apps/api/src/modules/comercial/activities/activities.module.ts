import { Module } from '@nestjs/common';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';

/* COM-008 — activities feature module (the CRM interaction timeline). PrismaService /
   RlsService / PoliciesGuard / CaslAbilityFactory come from the global modules; only
   the controller + service are provided here. Exported so COM-009 (system-generated
   activities from stage changes) can reuse the service. */
@Module({
  controllers: [ActivitiesController],
  providers: [ActivitiesService],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
