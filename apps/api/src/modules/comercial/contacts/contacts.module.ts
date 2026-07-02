import { Module } from '@nestjs/common';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';

/* COM-004 — contacts feature module (people within an account). PrismaService /
   RlsService / PoliciesGuard / CaslAbilityFactory come from the global modules;
   only the controller + service are provided here. Exported so later Comercial
   modules can reuse the service. */
@Module({
  controllers: [ContactsController],
  providers: [ContactsService],
  exports: [ContactsService],
})
export class ContactsModule {}
