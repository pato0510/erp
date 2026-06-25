import { Module } from '@nestjs/common';
import { NotificationModule } from '../../operations/notifications/notification.module';
import { EmployeeDocumentTypesController } from './employee-document-types.controller';
import { EmployeeDocumentTypesService } from './employee-document-types.service';
import { EmployeeDocumentRequirementsController } from './employee-document-requirements.controller';
import { EmployeeDocumentRequirementsService } from './employee-document-requirements.service';
import { EmployeeDocumentsController } from './employee-documents.controller';
import { EmployeeDocumentsService } from './employee-documents.service';
import { DocumentRemindersService } from './document-reminders.service';

/* HR-004a — employee documents (copy-adapted from the Operations doc-control
   engine). Three resources: document types, the requirements matrix, and the
   records. PrismaService/RlsService/StorageService come from their @Global
   modules.
   HR-005 — DocumentRemindersService (document-expiry reminders) is provided +
   exported here; it reuses NotificationService.createGeneric, so NotificationModule
   is imported. It runs on the HR-007 RrhhRemindersProcessor (EmployeeContractsModule
   imports this module to inject it) — NOT a new alert system. */
@Module({
  imports: [NotificationModule],
  controllers: [
    EmployeeDocumentTypesController,
    EmployeeDocumentRequirementsController,
    EmployeeDocumentsController,
  ],
  providers: [
    EmployeeDocumentTypesService,
    EmployeeDocumentRequirementsService,
    EmployeeDocumentsService,
    DocumentRemindersService,
  ],
  exports: [
    EmployeeDocumentTypesService,
    EmployeeDocumentRequirementsService,
    EmployeeDocumentsService,
    DocumentRemindersService,
  ],
})
export class EmployeeDocumentsModule {}
