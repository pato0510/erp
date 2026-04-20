import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BankingController } from './banking.controller';
import { BankingService } from './banking.service';
import { BankProviderFactory } from './providers/provider.factory';
import { BankSyncProcessor } from './jobs/bank-sync.processor';
import { BankSyncScheduler } from './jobs/bank-sync.scheduler';
import { CartolaImportController } from './cartola/cartola-import.controller';
import { CartolaImportService } from './cartola/cartola-import.service';
import { BANK_SYNC_QUEUE } from '../jobs/queues.constant';

@Module({
  imports: [BullModule.registerQueue({ name: BANK_SYNC_QUEUE })],
  controllers: [BankingController, CartolaImportController],
  providers: [
    BankingService,
    BankProviderFactory,
    BankSyncProcessor,
    BankSyncScheduler,
    CartolaImportService,
  ],
  exports: [BankingService],
})
export class BankingModule {}
