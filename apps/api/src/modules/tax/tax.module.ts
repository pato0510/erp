import { Module } from '@nestjs/common';
import { TaxController } from './tax.controller';
import { TaxService } from './tax.service';
import { SiiProviderFactory } from './providers/sii-provider.factory';

@Module({
  controllers: [TaxController],
  providers: [TaxService, SiiProviderFactory],
  exports: [TaxService],
})
export class TaxModule {}
