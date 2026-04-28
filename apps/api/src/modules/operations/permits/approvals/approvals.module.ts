import { Module } from '@nestjs/common';
import { NotificationModule } from '../../notifications/notification.module';
import { ApprovalActionsService } from './approval-actions.service';
import { ApprovalStepsController } from './approval-steps.controller';
import { ApprovalStepsService } from './approval-steps.service';
import { ApprovalsController } from './approvals.controller';

@Module({
  imports: [NotificationModule],
  controllers: [ApprovalStepsController, ApprovalsController],
  providers: [ApprovalStepsService, ApprovalActionsService],
  /* Both services are exported so WorkPermitsModule and the existing
     PermitsModule can import them and rewire their submit/approve
     paths through the multi-step engine. */
  exports: [ApprovalStepsService, ApprovalActionsService],
})
export class ApprovalsModule {}
