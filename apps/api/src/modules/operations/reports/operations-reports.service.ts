import { Injectable } from '@nestjs/common';
import { AssetComplianceReportGenerator } from './generators/asset-compliance-report.generator';
import { ActivityReportGenerator } from './generators/activity-report.generator';
import { AcknowledgmentCoverageReportGenerator } from './generators/acknowledgment-coverage.generator';
import { AlertsHistoryReportGenerator } from './generators/alerts-history.generator';
import { WorkPermitsReportGenerator } from './generators/work-permits.generator';
import type {
  AcknowledgmentCoverageFilters,
  ActivityFilters,
  AlertsHistoryFilters,
  AssetComplianceFilters,
  WorkPermitsFilters,
} from './dto/report-filter.dto';

/* OPS-031 — orchestrator. Each report kind has its own generator
   class so we can keep the file count manageable while letting NestJS
   wire them up via DI. The service is mostly a directory; the
   interesting work lives in the generator files. */
@Injectable()
export class OperationsReportsService {
  constructor(
    private readonly assetCompliance: AssetComplianceReportGenerator,
    private readonly activity: ActivityReportGenerator,
    private readonly ackCoverage: AcknowledgmentCoverageReportGenerator,
    private readonly alertsHistory: AlertsHistoryReportGenerator,
    private readonly workPermits: WorkPermitsReportGenerator,
  ) {}

  /* Excel exports */
  exportAssetCompliance(companyId: string, filters: AssetComplianceFilters) {
    return this.assetCompliance.generateExcel(companyId, filters);
  }
  exportActivity(companyId: string, filters: ActivityFilters) {
    return this.activity.generateExcel(companyId, filters);
  }
  exportAcknowledgmentCoverage(companyId: string, filters: AcknowledgmentCoverageFilters) {
    return this.ackCoverage.generateExcel(companyId, filters);
  }
  exportAlertsHistory(companyId: string, filters: AlertsHistoryFilters) {
    return this.alertsHistory.generateExcel(companyId, filters);
  }
  exportWorkPermits(companyId: string, filters: WorkPermitsFilters) {
    return this.workPermits.generateExcel(companyId, filters);
  }

  /* JSON previews */
  previewAssetCompliance(companyId: string, filters: AssetComplianceFilters) {
    return this.assetCompliance.generatePreview(companyId, filters);
  }
  previewActivity(companyId: string, filters: ActivityFilters) {
    return this.activity.generatePreview(companyId, filters);
  }
  previewAcknowledgmentCoverage(companyId: string, filters: AcknowledgmentCoverageFilters) {
    return this.ackCoverage.generatePreview(companyId, filters);
  }
  previewAlertsHistory(companyId: string, filters: AlertsHistoryFilters) {
    return this.alertsHistory.generatePreview(companyId, filters);
  }
  previewWorkPermits(companyId: string, filters: WorkPermitsFilters) {
    return this.workPermits.generatePreview(companyId, filters);
  }
}
