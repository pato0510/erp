import { Module } from '@nestjs/common';
import { AlertRulesModule } from './alerts/alert-rules.module';
import { AssetsModule } from './assets/assets.module';
import { AssetTypesModule } from './asset-types/asset-types.module';
import { DocumentControlModule } from './document-control/document-control.module';
import { DocumentRequirementsModule } from './document-requirements/document-requirements.module';
import { DocumentTypesModule } from './document-types/document-types.module';
import { FleetModule } from './fleet/fleet.module';
import { LocationsModule } from './locations/locations.module';
import { NotificationModule } from './notifications/notification.module';

@Module({
  imports: [
    AlertRulesModule,
    AssetsModule,
    AssetTypesModule,
    DocumentControlModule,
    DocumentRequirementsModule,
    DocumentTypesModule,
    FleetModule,
    LocationsModule,
    NotificationModule,
  ],
})
export class OperationsModule {}
