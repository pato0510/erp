import { Module } from '@nestjs/common';
import { PermitTypesModule } from './permit-types/permit-types.module';
import { PermitsController } from './permits.controller';
import { PermitsService } from './permits.service';

@Module({
  imports: [PermitTypesModule],
  controllers: [PermitsController],
  providers: [PermitsService],
  exports: [PermitsService, PermitTypesModule],
})
export class PermitsModule {}
