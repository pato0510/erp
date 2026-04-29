import { Module } from '@nestjs/common';
import { StorageModule } from '../../common/storage/storage.module';
import { OperationsReportsModule } from '../reports/operations-reports.module';
import { AuditPackageController } from './audit-package.controller';
import { AuditPackageService } from './audit-package.service';
import { AssetQrInventoryReportGenerator } from './reports/asset-qr-inventory.report';
import { AssetStatusChangesReportGenerator } from './reports/asset-status-changes.report';
import { ExceptionsAuditReportGenerator } from './reports/exceptions-audit.report';

/* OPS-036 — packaged compliance evidence. Imports
   OperationsReportsModule so the existing OPS-031 generators
   (asset compliance, ack coverage, alerts history, work permits)
   can be injected into AuditPackageService as singletons. The
   three new generators (exceptions, status changes, QR inventory)
   are local-only and registered as providers here. */
@Module({
  imports: [StorageModule, OperationsReportsModule],
  controllers: [AuditPackageController],
  providers: [
    AuditPackageService,
    ExceptionsAuditReportGenerator,
    AssetStatusChangesReportGenerator,
    AssetQrInventoryReportGenerator,
  ],
  exports: [AuditPackageService],
})
export class AuditPackageModule {}
