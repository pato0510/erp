import { Module } from '@nestjs/common';
import { NotificationModule } from '../../notifications/notification.module';
import { AcknowledgmentsController } from './acknowledgments.controller';
import { AcknowledgmentsService } from './acknowledgments.service';

@Module({
  imports: [NotificationModule],
  controllers: [AcknowledgmentsController],
  providers: [AcknowledgmentsService],
  /* Exports the service so ProceduresService can call into the
     lifecycle hooks (createPending on publish, trackView on
     download, etc). */
  exports: [AcknowledgmentsService],
})
export class AcknowledgmentsModule {}
