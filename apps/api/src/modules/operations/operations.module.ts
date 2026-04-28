import { Module } from '@nestjs/common';
import { AssetsModule } from './assets/assets.module';
import { AssetTypesModule } from './asset-types/asset-types.module';
import { FleetModule } from './fleet/fleet.module';
import { LocationsModule } from './locations/locations.module';

@Module({
  imports: [AssetsModule, AssetTypesModule, FleetModule, LocationsModule],
})
export class OperationsModule {}
