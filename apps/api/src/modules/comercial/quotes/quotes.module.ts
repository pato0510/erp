import { Module } from '@nestjs/common';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';

/* COM-010 — quotes feature module (the quotation documents). PrismaService /
   RlsService / PoliciesGuard / CaslAbilityFactory come from the global modules; only
   the controller + service are provided here. Exported so a later PDF/export ticket
   (COM-011+) can reuse the service. */
@Module({
  controllers: [QuotesController],
  providers: [QuotesService],
  exports: [QuotesService],
})
export class QuotesModule {}
