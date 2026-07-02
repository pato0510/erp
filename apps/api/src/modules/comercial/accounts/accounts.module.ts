import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';

/* COM-003 — accounts feature module (CRM core). PrismaService / RlsService /
   PoliciesGuard / CaslAbilityFactory come from the global modules; only the
   controller + service are provided here. Exported so later Comercial modules
   (opportunities, activities) can reuse the service. */
@Module({
  controllers: [AccountsController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}
