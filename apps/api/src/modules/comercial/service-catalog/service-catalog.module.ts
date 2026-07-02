import { Module } from '@nestjs/common';
import { ServiceCatalogController } from './service-catalog.controller';
import { ServiceCatalogService } from './service-catalog.service';

/* COM-002 — service_catalog feature module. PrismaService / RlsService /
   PoliciesGuard / CaslAbilityFactory come from the global Prisma/Rls/Casl
   modules; only the controller + service are provided here. Exported so later
   Comercial modules (opportunity_services, quote_lines) can reuse the service. */
@Module({
  controllers: [ServiceCatalogController],
  providers: [ServiceCatalogService],
  exports: [ServiceCatalogService],
})
export class ServiceCatalogModule {}
