import { Module } from '@nestjs/common';
import { AccountsModule } from './accounts/accounts.module';
import { ComercialController } from './comercial.controller';
import { ContactsModule } from './contacts/contacts.module';
import { ServiceCatalogModule } from './service-catalog/service-catalog.module';

/* COM-001 — Comercial (CRM) module aggregator. COM-002 adds ServiceCatalogModule
 * (the shared service catalog); COM-003 adds AccountsModule (the CRM core);
 * COM-004 adds ContactsModule (people within an account). Remaining feature
 * submodules (opportunities, activities, quotes) are imported here as their
 * tickets land, mirroring how RrhhModule / OperationsModule aggregate their
 * feature submodules. PoliciesGuard / CaslAbilityFactory / PrismaService are
 * provided by the global Casl/Prisma modules. */
@Module({
  imports: [ServiceCatalogModule, AccountsModule, ContactsModule],
  controllers: [ComercialController],
})
export class ComercialModule {}
