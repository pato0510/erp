import { Module } from '@nestjs/common';
import { SettlementsController } from './settlements.controller';
import { SettlementsService } from './settlements.service';

/* HR-009 — registro de remuneraciones (record-only; no liquidación engine).
   Salary-guarded at the controller via the EmployeeCompensation CASL subject.
   PrismaService/RlsService come from their @Global modules. */
@Module({
  controllers: [SettlementsController],
  providers: [SettlementsService],
  exports: [SettlementsService],
})
export class SettlementsModule {}
