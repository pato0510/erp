import { Module } from '@nestjs/common';
import { DisponibilidadModule } from '../rrhh/disponibilidad/disponibilidad.module';
import { AccountsModule } from './accounts/accounts.module';
import { ActivitiesModule } from './activities/activities.module';
import { ComercialController } from './comercial.controller';
import { ContactsModule } from './contacts/contacts.module';
import { OpportunitiesModule } from './opportunities/opportunities.module';
import { QuotesModule } from './quotes/quotes.module';
import { ServiceCatalogModule } from './service-catalog/service-catalog.module';

/* COM-001 — Comercial (CRM) module aggregator. COM-002 adds ServiceCatalogModule
 * (the shared service catalog); COM-003 adds AccountsModule (the CRM core);
 * COM-004 adds ContactsModule (people within an account); COM-005 adds
 * OpportunitiesModule (the pipeline); COM-008 adds ActivitiesModule (the interaction
 * timeline). Remaining feature submodules (quotes) are imported here as their tickets
 * land, mirroring how RrhhModule / OperationsModule aggregate their feature
 * submodules. PoliciesGuard / CaslAbilityFactory / PrismaService are provided by the
 * global Casl/Prisma modules.
 *
 * COM-012 — imports RRHH's DisponibilidadModule (which EXPORTS DisponibilidadService)
 * to consume the reason-free availability projection via the ComercialController. This
 * is the ONLY RRHH module imported, and the service is NOT re-provided here. */
@Module({
  imports: [
    ServiceCatalogModule,
    AccountsModule,
    ContactsModule,
    OpportunitiesModule,
    ActivitiesModule,
    QuotesModule,
    DisponibilidadModule,
  ],
  controllers: [ComercialController],
})
export class ComercialModule {}
