import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { StorageModule } from '../../common/storage/storage.module';
import {
  OPERATIONS_ALERT_ENGINE_QUEUE,
  OPERATIONS_DASHBOARD_MV_REFRESH_QUEUE,
  OPERATIONS_WORK_PERMITS_QUEUE,
} from '../../jobs/queues.constant';
import { OperationsDashboardModule } from '../dashboard/operations-dashboard.module';
import { OperationsHealthController } from './operations-health.controller';

/* OPS-037 — module health endpoints. Imports BullMQ queues read-only
   so the controller can list repeatable jobs across all operations
   queues; imports OperationsDashboardModule for the
   MaterializedViewsService freshness check. PrismaService and
   StorageService come from global modules. */
@Module({
  imports: [
    StorageModule,
    OperationsDashboardModule,
    BullModule.registerQueue(
      { name: OPERATIONS_ALERT_ENGINE_QUEUE },
      { name: OPERATIONS_WORK_PERMITS_QUEUE },
      { name: OPERATIONS_DASHBOARD_MV_REFRESH_QUEUE },
    ),
  ],
  controllers: [OperationsHealthController],
})
export class OperationsHealthModule {}
