import { Module } from '@nestjs/common';
import { PresenceController } from './presence.controller';
import { PresenceService } from './presence.service';

/* MKT-008 — presence-snapshots feature module (Marketing). PrismaService / RlsService /
   PoliciesGuard / CaslAbilityFactory come from the global modules; only the controller +
   service are provided here. Registered in MarketingModule. */
@Module({
  controllers: [PresenceController],
  providers: [PresenceService],
})
export class PresenceModule {}
