import { Module } from '@nestjs/common';
import { AssetsModule } from './assets/assets.module';
import { AssetTypesModule } from './asset-types/asset-types.module';
import { DocumentControlModule } from './document-control/document-control.module';
import { DocumentRequirementsModule } from './document-requirements/document-requirements.module';
import { DocumentTypesModule } from './document-types/document-types.module';
import { FleetModule } from './fleet/fleet.module';
import { LocationsModule } from './locations/locations.module';

@Module({
  imports: [
    AssetsModule,
    AssetTypesModule,
    DocumentControlModule,
    DocumentRequirementsModule,
    DocumentTypesModule,
    FleetModule,
    LocationsModule,
  ],
})
export class OperationsModule {}
