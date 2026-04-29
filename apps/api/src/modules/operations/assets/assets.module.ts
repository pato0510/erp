import { Module } from '@nestjs/common';
import { StorageModule } from '../../common/storage/storage.module';
import { AlertRulesModule } from '../alerts/alert-rules.module';
import { AssetQrController } from './asset-qr.controller';
import { AssetQrService } from './asset-qr.service';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { AssetImportModule } from './import/asset-import.module';

@Module({
  /* AlertRulesModule exposes AssetBlockingService used by both the
     manual update flow (logs MANUAL audit + re-evaluates) and the new
     OPS-020 endpoints (history, blocked list, force-unblock).
     OPS-035 adds AssetQrService + AssetQrController; the QR layer
     reuses RlsService (global) and OperationalAssetSubject (CASL),
     so no extra module imports are needed for it. */
  imports: [StorageModule, AssetImportModule, AlertRulesModule],
  controllers: [AssetsController, AssetQrController],
  providers: [AssetsService, AssetQrService],
  exports: [AssetsService, AssetQrService],
})
export class AssetsModule {}
