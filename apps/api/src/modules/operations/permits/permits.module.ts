import { Module } from '@nestjs/common';
import { ApprovalsModule } from './approvals/approvals.module';
import { PermitTypesModule } from './permit-types/permit-types.module';
import { PermitsController } from './permits.controller';
import { PermitsService } from './permits.service';
import { WorkPermitsModule } from './work-permits/work-permits.module';

@Module({
  /* ApprovalsModule must be imported BEFORE WorkPermitsModule so the
     work-permits service can inject ApprovalActionsService for its
     submit/authorize/reject paths. PermitsService consumes the same
     module to upgrade external permits to multi-step approvals. */
  imports: [ApprovalsModule, PermitTypesModule, WorkPermitsModule],
  controllers: [PermitsController],
  providers: [PermitsService],
  exports: [PermitsService, PermitTypesModule, WorkPermitsModule, ApprovalsModule],
})
export class PermitsModule {}
