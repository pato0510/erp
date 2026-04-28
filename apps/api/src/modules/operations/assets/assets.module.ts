import { Module } from '@nestjs/common';
import { StorageModule } from '../../common/storage/storage.module';
import { AlertRulesModule } from '../alerts/alert-rules.module';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { AssetImportModule } from './import/asset-import.module';

@Module({
  /* AlertRulesModule exposes AssetBlockingService used by both the
     manual update flow (logs MANUAL audit + re-evaluates) and the new
     OPS-020 endpoints (history, blocked list, force-unblock). */
  imports: [StorageModule, AssetImportModule, AlertRulesModule],
  controllers: [AssetsController],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}
