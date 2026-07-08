import { Module } from '@nestjs/common';
import { ServiceOrderHandoffListener } from './service-order-handoff.listener';
import { ServiceOrdersController } from './service-orders.controller';
import { ServiceOrdersService } from './service-orders.service';

/* COM-013a — service orders feature module. PrismaService / RlsService / PoliciesGuard /
   CaslAbilityFactory come from the global modules. The service is EXPORTED so the
   COM-013b handoff handler can call createFromHandoff — the internal creation seam that
   has no user-facing endpoint.

   COM-013b — registers the ServiceOrderHandoffListener (@OnEvent 'comercial.opportunity-
   won'). EventEmitter2 is global (AppModule), so being a provider here is enough for
   Nest to subscribe it; it injects ServiceOrdersService from this module. */
@Module({
  controllers: [ServiceOrdersController],
  providers: [ServiceOrdersService, ServiceOrderHandoffListener],
  exports: [ServiceOrdersService],
})
export class ServiceOrdersModule {}
