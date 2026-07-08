import { Module } from '@nestjs/common';
import { ServiceOrdersController } from './service-orders.controller';
import { ServiceOrdersService } from './service-orders.service';

/* COM-013a — service orders feature module. PrismaService / RlsService / PoliciesGuard /
   CaslAbilityFactory come from the global modules. The service is EXPORTED so the
   COM-013b handoff handler (a Comercial→Operaciones @OnEvent listener) can inject it and
   call createFromHandoff — the internal creation seam that has no user-facing endpoint. */
@Module({
  controllers: [ServiceOrdersController],
  providers: [ServiceOrdersService],
  exports: [ServiceOrdersService],
})
export class ServiceOrdersModule {}
