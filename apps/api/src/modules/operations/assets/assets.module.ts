import { Module } from '@nestjs/common';
import { StorageModule } from '../../common/storage/storage.module';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { AssetImportModule } from './import/asset-import.module';

@Module({
  imports: [StorageModule, AssetImportModule],
  controllers: [AssetsController],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}
