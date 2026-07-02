import { Module } from '@nestjs/common';
import { ComercialController } from './comercial.controller';
import { ServiceCatalogModule } from './service-catalog/service-catalog.module';

/* COM-001 — Comercial (CRM) module aggregator. COM-002 adds ServiceCatalogModule
 * (the shared service catalog). Remaining feature submodules (accounts, contacts,
 * opportunities, activities, quotes) are imported here as their tickets land,
 * mirroring how RrhhModule / OperationsModule aggregate their feature submodules.
 * PoliciesGuard / CaslAbilityFactory / PrismaService are provided by the global
 * Casl/Prisma modules. */
@Module({
  imports: [ServiceCatalogModule],
  controllers: [ComercialController],
})
export class ComercialModule {}
