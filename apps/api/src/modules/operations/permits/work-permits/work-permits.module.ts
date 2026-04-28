import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { OPERATIONS_WORK_PERMITS_QUEUE } from '../../../jobs/queues.constant';
import { NotificationModule } from '../../notifications/notification.module';
import { WorkPermitTypesController } from './work-permit-types.controller';
import { WorkPermitTypesService } from './work-permit-types.service';
import { WorkPermitsController } from './work-permits.controller';
import { WorkPermitsProcessor } from './work-permits.processor';
import { WorkPermitsService } from './work-permits.service';

@Module({
  imports: [
    /* NotificationModule provides createGeneric for fan-out on each
       lifecycle transition. The dedicated BullMQ queue isolates the
       hourly expiration cron from the alert-engine queue so a slow
       expiration sweep can't delay the daily alert recalc. */
    NotificationModule,
    BullModule.registerQueue({ name: OPERATIONS_WORK_PERMITS_QUEUE }),
  ],
  controllers: [WorkPermitTypesController, WorkPermitsController],
  providers: [WorkPermitTypesService, WorkPermitsService, WorkPermitsProcessor],
  exports: [WorkPermitTypesService, WorkPermitsService],
})
export class WorkPermitsModule {}
