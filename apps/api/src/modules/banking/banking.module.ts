import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BankingController } from './banking.controller';
import { BankingService } from './banking.service';
import { BankProviderFactory } from './providers/provider.factory';
import { BankSyncProcessor } from './jobs/bank-sync.processor';
import { BankSyncScheduler } from './jobs/bank-sync.scheduler';
import { BANK_SYNC_QUEUE } from '../jobs/queues.constant';

@Module({
  imports: [BullModule.registerQueue({ name: BANK_SYNC_QUEUE })],
  controllers: [BankingController],
  providers: [BankingService, BankProviderFactory, BankSyncProcessor, BankSyncScheduler],
  exports: [BankingService],
})
export class BankingModule {}
