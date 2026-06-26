import { Module } from '@nestjs/common';
import { VacationsModule } from '../vacations/vacations.module';
import { TerminationsController } from './terminations.controller';
import { TerminationsService } from './terminations.service';

/* HR-010 — finiquito estimación + registro. Salary-guarded at the controller via
   the TerminationSimulation CASL subject. VacationsModule (exports VacationsService)
   is imported so the feriado proporcional default reuses the HR-011 vacation saldo
   — NOT a new balance calc. PrismaService/RlsService come from their @Global
   modules. */
@Module({
  imports: [VacationsModule],
  controllers: [TerminationsController],
  providers: [TerminationsService],
  exports: [TerminationsService],
})
export class TerminationsModule {}
