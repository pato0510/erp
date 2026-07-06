import { Module } from '@nestjs/common';
import { AccountsModule } from './accounts/accounts.module';
import { ActivitiesModule } from './activities/activities.module';
import { ComercialController } from './comercial.controller';
import { ContactsModule } from './contacts/contacts.module';
import { OpportunitiesModule } from './opportunities/opportunities.module';
import { ServiceCatalogModule } from './service-catalog/service-catalog.module';

/* COM-001 — Comercial (CRM) module aggregator. COM-002 adds ServiceCatalogModule
 * (the shared service catalog); COM-003 adds AccountsModule (the CRM core);
 * COM-004 adds ContactsModule (people within an account); COM-005 adds
 * OpportunitiesModule (the pipeline); COM-008 adds ActivitiesModule (the interaction
 * timeline). Remaining feature submodules (quotes) are imported here as their tickets
 * land, mirroring how RrhhModule / OperationsModule aggregate their feature
 * submodules. PoliciesGuard / CaslAbilityFactory / PrismaService are provided by the
 * global Casl/Prisma modules. */
@Module({
  imports: [
    ServiceCatalogModule,
    AccountsModule,
    ContactsModule,
    OpportunitiesModule,
    ActivitiesModule,
  ],
  controllers: [ComercialController],
})
export class ComercialModule {}
