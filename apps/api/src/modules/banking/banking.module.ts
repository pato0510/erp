import { Module } from '@nestjs/common';
import { BankingController } from './banking.controller';
import { BankingService } from './banking.service';
import { BankProviderFactory } from './providers/provider.factory';

@Module({
  controllers: [BankingController],
  providers: [BankingService, BankProviderFactory],
  exports: [BankingService],
})
export class BankingModule {}
