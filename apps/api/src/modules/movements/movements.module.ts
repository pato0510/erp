import { Module } from '@nestjs/common';
import { CatalogsModule } from '../catalogs/catalogs.module';
import { MovementRecategorizationService } from './movement-recategorization.service';
import { MovementsController } from './movements.controller';
import { MovementsService } from './movements.service';
import { MovementImportController } from './import/movement-import.controller';
import { MovementImportService } from './import/movement-import.service';

@Module({
  imports: [CatalogsModule],
  controllers: [MovementsController, MovementImportController],
  providers: [MovementsService, MovementImportService, MovementRecategorizationService],
  exports: [MovementsService],
})
export class MovementsModule {}
