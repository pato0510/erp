import { Module } from '@nestjs/common';
import { OpportunityNotesController } from './opportunity-notes.controller';
import { OpportunityNotesService } from './opportunity-notes.service';

/* COM-016 — opportunity notes feature module (the internal note thread on a deal).
   PrismaService / RlsService / PoliciesGuard / CaslAbilityFactory come from the global
   modules; only the controller + service are provided here. */
@Module({
  controllers: [OpportunityNotesController],
  providers: [OpportunityNotesService],
})
export class OpportunityNotesModule {}
