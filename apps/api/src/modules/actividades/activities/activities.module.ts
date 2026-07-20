import { Module } from '@nestjs/common';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';

/* CAL-003 — calendar-activities feature module. PrismaService / RlsService / PoliciesGuard /
   CaslAbilityFactory come from the global modules. ActivitiesService is exported so the root
   ActividadesController can serve the month FEED (GET /actividades/calendar) from it, and so
   CAL-006 can fold birthdays into the same envelope. */
@Module({
  controllers: [ActivitiesController],
  providers: [ActivitiesService],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
