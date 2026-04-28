import { Module } from '@nestjs/common';
import { DocumentRequirementsModule } from '../document-requirements/document-requirements.module';
import { AssetFolderExportService } from './asset-folder-export.service';
import { DocumentRecordsController } from './document-records.controller';
import { DocumentRecordsService } from './document-records.service';

@Module({
  /* DocumentRequirementsModule exposes the resolveRequirementsForAsset
     helper used by the OPS-017 folder endpoint. */
  imports: [DocumentRequirementsModule],
  controllers: [DocumentRecordsController],
  providers: [DocumentRecordsService, AssetFolderExportService],
  exports: [DocumentRecordsService],
})
export class DocumentControlModule {}
