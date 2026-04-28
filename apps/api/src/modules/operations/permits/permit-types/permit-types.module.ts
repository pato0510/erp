import { Module } from '@nestjs/common';
import { PermitTypesController } from './permit-types.controller';
import { PermitTypesService } from './permit-types.service';

@Module({
  controllers: [PermitTypesController],
  providers: [PermitTypesService],
  exports: [PermitTypesService],
})
export class PermitTypesModule {}
