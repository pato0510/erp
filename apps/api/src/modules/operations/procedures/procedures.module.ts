import { Module } from '@nestjs/common';
import { NotificationModule } from '../notifications/notification.module';
import { AcknowledgmentsModule } from './acknowledgments/acknowledgments.module';
import { ProceduresController } from './procedures.controller';
import { ProceduresService } from './procedures.service';

@Module({
  /* AcknowledgmentsModule must be imported here so ProceduresService
     can inject AcknowledgmentsService for publish + downloadFile
     hooks (OPS-028). */
  imports: [NotificationModule, AcknowledgmentsModule],
  controllers: [ProceduresController],
  providers: [ProceduresService],
  exports: [ProceduresService, AcknowledgmentsModule],
})
export class ProceduresModule {}
