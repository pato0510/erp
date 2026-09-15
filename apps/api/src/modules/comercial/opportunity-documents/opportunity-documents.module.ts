import { Module } from '@nestjs/common';
import { OpportunityDocumentsController } from './opportunity-documents.controller';
import { OpportunityDocumentsService } from './opportunity-documents.service';

/* COM-017 — opportunity documents feature module (files attached to a deal).
   PrismaService / RlsService / StorageService / PoliciesGuard / CaslAbilityFactory come
   from the @Global modules; only the controller + service are provided here. */
@Module({
  controllers: [OpportunityDocumentsController],
  providers: [OpportunityDocumentsService],
})
export class OpportunityDocumentsModule {}
