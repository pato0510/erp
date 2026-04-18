import { Module } from '@nestjs/common';
import { MovementsController } from './movements.controller';
import { MovementsService } from './movements.service';
import { MovementImportController } from './import/movement-import.controller';
import { MovementImportService } from './import/movement-import.service';

@Module({
  controllers: [MovementsController, MovementImportController],
  providers: [MovementsService, MovementImportService],
  exports: [MovementsService],
})
export class MovementsModule {}
