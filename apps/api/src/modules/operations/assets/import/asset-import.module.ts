import { Module } from '@nestjs/common';
import { StorageModule } from '../../../common/storage/storage.module';
import { AssetImportController } from './asset-import.controller';
import { AssetImportService } from './asset-import.service';

@Module({
  imports: [StorageModule],
  controllers: [AssetImportController],
  providers: [AssetImportService],
  exports: [AssetImportService],
})
export class AssetImportModule {}
