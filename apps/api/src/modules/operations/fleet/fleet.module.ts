import { Module } from '@nestjs/common';
import { AlertRulesModule } from '../alerts/alert-rules.module';
import { FleetController } from './fleet.controller';
import { FleetService } from './fleet.service';
import { VehicleImportModule } from './import/vehicle-import.module';

@Module({
  /* AlertRulesModule re-exports AssetBlockingService so the fleet
     update flow can mirror the AssetsService re-block detection. */
  imports: [VehicleImportModule, AlertRulesModule],
  controllers: [FleetController],
  providers: [FleetService],
  exports: [FleetService],
})
export class FleetModule {}
