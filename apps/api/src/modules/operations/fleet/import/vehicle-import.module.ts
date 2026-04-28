import { Module } from '@nestjs/common';
import { StorageModule } from '../../../common/storage/storage.module';
import { VehicleImportController } from './vehicle-import.controller';
import { VehicleImportService } from './vehicle-import.service';

@Module({
  imports: [StorageModule],
  controllers: [VehicleImportController],
  providers: [VehicleImportService],
  exports: [VehicleImportService],
})
export class VehicleImportModule {}
