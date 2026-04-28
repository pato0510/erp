import { Module } from '@nestjs/common';
import { NotificationModule } from '../notifications/notification.module';
import { ProceduresController } from './procedures.controller';
import { ProceduresService } from './procedures.service';

@Module({
  imports: [NotificationModule],
  controllers: [ProceduresController],
  providers: [ProceduresService],
  exports: [ProceduresService],
})
export class ProceduresModule {}
