import { Module } from '@nestjs/common';
import { EnterprisesController } from './enterprises.controller';
import { EnterprisesService } from './enterprises.service';

/* COM-018 — enterprises feature module (the client's parent company). PrismaService /
   RlsService / PoliciesGuard / CaslAbilityFactory come from the global modules; only the
   controller + service are provided here. */
@Module({
  controllers: [EnterprisesController],
  providers: [EnterprisesService],
})
export class EnterprisesModule {}
