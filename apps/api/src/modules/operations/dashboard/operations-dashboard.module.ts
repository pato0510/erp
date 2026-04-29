import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { OPERATIONS_DASHBOARD_MV_REFRESH_QUEUE } from '../../jobs/queues.constant';
import { AlertRulesModule } from '../alerts/alert-rules.module';
import { DocumentControlModule } from '../document-control/document-control.module';
import { ExceptionsModule } from '../exceptions/exceptions.module';
import { PermitsModule } from '../permits/permits.module';
import { ProceduresModule } from '../procedures/procedures.module';
import { DashboardMvRefreshProcessor } from './dashboard-mv-refresh.processor';
import { MaterializedViewsService } from './materialized-views.service';
import { OperationsDashboardController } from './operations-dashboard.controller';
import { OperationsDashboardService } from './operations-dashboard.service';

/* OPS-029 — landing-page aggregator. Imports every feature module
   whose service the dashboard reads from. PermitsModule re-exports
   ApprovalsModule + WorkPermitsModule so we get ApprovalActionsService
   and WorkPermitsService transitively. ProceduresModule re-exports
   AcknowledgmentsModule. AlertRulesModule now exports
   AlertInstancesService alongside AssetBlockingService.
   OPS-034 — also hosts the materialized-views refresh layer:
   MaterializedViewsService (read/refresh) + DashboardMvRefreshProcessor
   (BullMQ cron + domain-event listeners). */
@Module({
  imports: [
    AlertRulesModule,
    DocumentControlModule,
    ExceptionsModule,
    PermitsModule,
    ProceduresModule,
    BullModule.registerQueue({ name: OPERATIONS_DASHBOARD_MV_REFRESH_QUEUE }),
  ],
  controllers: [OperationsDashboardController],
  providers: [OperationsDashboardService, MaterializedViewsService, DashboardMvRefreshProcessor],
  /* OPS-037 — exported so OperationsHealthModule can probe MV
     freshness without re-instantiating the service. */
  exports: [MaterializedViewsService],
})
export class OperationsDashboardModule {}
