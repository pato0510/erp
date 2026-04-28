import { Module } from '@nestjs/common';
import { PermitTypesModule } from './permit-types/permit-types.module';
import { PermitsController } from './permits.controller';
import { PermitsService } from './permits.service';
import { WorkPermitsModule } from './work-permits/work-permits.module';

@Module({
  imports: [PermitTypesModule, WorkPermitsModule],
  controllers: [PermitsController],
  providers: [PermitsService],
  exports: [PermitsService, PermitTypesModule, WorkPermitsModule],
})
export class PermitsModule {}
