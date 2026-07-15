import { Module } from '@nestjs/common';
import { AreasController } from './areas.controller';
import { AreasService } from './areas.service';

/* CAL-002 — activity-areas feature module. PrismaService / RlsService / PoliciesGuard /
   CaslAbilityFactory come from the global modules; only the controller + service are
   provided here. Exported so CAL-003 (activities) can reuse the service for the
   area-validation on activity create/edit. */
@Module({
  controllers: [AreasController],
  providers: [AreasService],
  exports: [AreasService],
})
export class AreasModule {}
