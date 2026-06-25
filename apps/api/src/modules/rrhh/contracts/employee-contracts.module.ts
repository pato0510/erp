import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { RRHH_REMINDERS_QUEUE } from '../../jobs/queues.constant';
import { NotificationModule } from '../../operations/notifications/notification.module';
import { ContractRemindersService } from './contract-reminders.service';
import { EmployeeContractsController } from './employee-contracts.controller';
import { EmployeeContractsService } from './employee-contracts.service';
import { RrhhRemindersProcessor } from './rrhh-reminders.processor';

/* HR-007 — employee contracts + anexos + the RRHH reminder cron foundation.
   NotificationModule (exports NotificationService) is imported to reuse the
   generic inbox for contract-expiry reminders — the recon-R2 reuse path, NOT a
   new alert system. The RRHH_REMINDERS_QUEUE is registered here so the cron job
   and the service reach the same Queue instance. PrismaService/RlsService come
   from their @Global modules. */
@Module({
  imports: [NotificationModule, BullModule.registerQueue({ name: RRHH_REMINDERS_QUEUE })],
  controllers: [EmployeeContractsController],
  providers: [EmployeeContractsService, ContractRemindersService, RrhhRemindersProcessor],
  exports: [EmployeeContractsService, ContractRemindersService],
})
export class EmployeeContractsModule {}
