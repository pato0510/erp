import { Module } from '@nestjs/common';
import { TaxController } from './tax.controller';
import { TaxService } from './tax.service';
import { SiiProviderFactory } from './providers/sii-provider.factory';
import { SiiConnectionController } from './sii-connection.controller';
import { SiiConnectionService } from './sii-connection.service';
import { LibreDteClient } from './libredte.client';

@Module({
  controllers: [TaxController, SiiConnectionController],
  providers: [TaxService, SiiProviderFactory, SiiConnectionService, LibreDteClient],
  exports: [TaxService, SiiConnectionService, LibreDteClient],
})
export class TaxModule {}
