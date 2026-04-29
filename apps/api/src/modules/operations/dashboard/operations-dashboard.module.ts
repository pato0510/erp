import { Module } from '@nestjs/common';
import { AlertRulesModule } from '../alerts/alert-rules.module';
import { DocumentControlModule } from '../document-control/document-control.module';
import { ExceptionsModule } from '../exceptions/exceptions.module';
import { PermitsModule } from '../permits/permits.module';
import { ProceduresModule } from '../procedures/procedures.module';
import { OperationsDashboardController } from './operations-dashboard.controller';
import { OperationsDashboardService } from './operations-dashboard.service';

/* OPS-029 — landing-page aggregator. Imports every feature module
   whose service the dashboard reads from. PermitsModule re-exports
   ApprovalsModule + WorkPermitsModule so we get ApprovalActionsService
   and WorkPermitsService transitively. ProceduresModule re-exports
   AcknowledgmentsModule. AlertRulesModule now exports
   AlertInstancesService alongside AssetBlockingService. */
@Module({
  imports: [
    AlertRulesModule,
    DocumentControlModule,
    ExceptionsModule,
    PermitsModule,
    ProceduresModule,
  ],
  controllers: [OperationsDashboardController],
  providers: [OperationsDashboardService],
})
export class OperationsDashboardModule {}
