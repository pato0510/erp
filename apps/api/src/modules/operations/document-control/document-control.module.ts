import { forwardRef, Module } from '@nestjs/common';
import { AlertRulesModule } from '../alerts/alert-rules.module';
import { DocumentRequirementsModule } from '../document-requirements/document-requirements.module';
import { AssetFolderExportService } from './asset-folder-export.service';
import { DocumentRecordsController } from './document-records.controller';
import { DocumentRecordsService } from './document-records.service';

@Module({
  /* DocumentRequirementsModule exposes the resolveRequirementsForAsset
     helper used by the OPS-017 folder endpoint. AlertRulesModule
     exposes AssetBlockingService, called from DocumentRecordsService
     after a successful approve to potentially auto-unblock the asset. */
  imports: [DocumentRequirementsModule, forwardRef(() => AlertRulesModule)],
  controllers: [DocumentRecordsController],
  providers: [DocumentRecordsService, AssetFolderExportService],
  exports: [DocumentRecordsService],
})
export class DocumentControlModule {}
