import { Module } from '@nestjs/common';
import { PayrollParametersController } from './payroll-parameters.controller';
import { PayrollParametersService } from './payroll-parameters.service';

/* HR-008 — payroll parameters (Nivel A: store + expose only; no liquidación
   engine). PrismaService/RlsService come from their @Global modules. */
@Module({
  controllers: [PayrollParametersController],
  providers: [PayrollParametersService],
  exports: [PayrollParametersService],
})
export class PayrollParametersModule {}
