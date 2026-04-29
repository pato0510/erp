import { Module } from '@nestjs/common';
import { AcknowledgmentCoverageReportGenerator } from './generators/acknowledgment-coverage.generator';
import { ActivityReportGenerator } from './generators/activity-report.generator';
import { AlertsHistoryReportGenerator } from './generators/alerts-history.generator';
import { AssetComplianceReportGenerator } from './generators/asset-compliance-report.generator';
import { WorkPermitsReportGenerator } from './generators/work-permits.generator';
import { OperationsReportsController } from './operations-reports.controller';
import { OperationsReportsService } from './operations-reports.service';

/* OPS-031 — registers all 5 report generators alongside the
   orchestrating service + controller. PrismaService is provided
   globally so no extra imports are needed. */
@Module({
  controllers: [OperationsReportsController],
  providers: [
    OperationsReportsService,
    AssetComplianceReportGenerator,
    ActivityReportGenerator,
    AcknowledgmentCoverageReportGenerator,
    AlertsHistoryReportGenerator,
    WorkPermitsReportGenerator,
  ],
  /* OPS-036 — re-exported so the audit-package module can inject
     the same singletons rather than instantiate parallel ones. */
  exports: [
    AssetComplianceReportGenerator,
    AcknowledgmentCoverageReportGenerator,
    AlertsHistoryReportGenerator,
    WorkPermitsReportGenerator,
  ],
})
export class OperationsReportsModule {}
