import { Module } from '@nestjs/common';
import { NotificationModule } from '../../operations/notifications/notification.module';
import { CertificationRemindersService } from './certification-reminders.service';
import { CertificationTypesController } from './certification-types.controller';
import { CertificationTypesService } from './certification-types.service';
import { CertificationsController } from './certifications.controller';
import { CertificationsService } from './certifications.service';

/* HR-014 — certificaciones / habilitaciones (copy-adapt of HR-004). Types catalog
   + records + compliance. CertificationRemindersService reuses the generic inbox
   (NotificationService.createGeneric), so NotificationModule is imported; it runs
   on the HR-005/HR-007 RrhhRemindersProcessor (EmployeeContractsModule imports
   this module to inject it). PrismaService/RlsService come from their @Global
   modules. */
@Module({
  imports: [NotificationModule],
  controllers: [CertificationTypesController, CertificationsController],
  providers: [CertificationTypesService, CertificationsService, CertificationRemindersService],
  exports: [CertificationTypesService, CertificationsService, CertificationRemindersService],
})
export class CertificationsModule {}
