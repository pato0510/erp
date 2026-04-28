import { forwardRef, Module } from '@nestjs/common';
import { AlertRulesModule } from '../alerts/alert-rules.module';
import { NotificationModule } from '../notifications/notification.module';
import { ExceptionsController } from './exceptions.controller';
import { ExceptionsService } from './exceptions.service';

@Module({
  /* AlertRulesModule re-exports AssetBlockingService used by approve
     and processExpired. NotificationModule is needed for the per-user
     fan-out on every transition. forwardRef breaks the cycle:
     AlertRulesModule depends on this module for the cron processor
     (OPS-023). */
  imports: [forwardRef(() => AlertRulesModule), NotificationModule],
  controllers: [ExceptionsController],
  providers: [ExceptionsService],
  exports: [ExceptionsService],
})
export class ExceptionsModule {}
