import { Module } from '@nestjs/common';
import { AssetSubtypesController } from './asset-subtypes/asset-subtypes.controller';
import { AssetSubtypesService } from './asset-subtypes/asset-subtypes.service';
import { AssetTypesController } from './asset-types.controller';
import { AssetTypesService } from './asset-types.service';

@Module({
  controllers: [AssetTypesController, AssetSubtypesController],
  providers: [AssetTypesService, AssetSubtypesService],
  exports: [AssetTypesService, AssetSubtypesService],
})
export class AssetTypesModule {}
