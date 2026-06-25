import { Module } from '@nestjs/common';
import { VacationsController } from './vacations.controller';
import { VacationsService } from './vacations.service';

/* HR-011 — vacaciones / feriado legal. Balance is computed (vacation-calc.ts),
   never stored. PrismaService/RlsService come from their @Global modules. */
@Module({
  controllers: [VacationsController],
  providers: [VacationsService],
  exports: [VacationsService],
})
export class VacationsModule {}
