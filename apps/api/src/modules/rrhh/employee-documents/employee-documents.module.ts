import { Module } from '@nestjs/common';
import { EmployeeDocumentTypesController } from './employee-document-types.controller';
import { EmployeeDocumentTypesService } from './employee-document-types.service';
import { EmployeeDocumentRequirementsController } from './employee-document-requirements.controller';
import { EmployeeDocumentRequirementsService } from './employee-document-requirements.service';
import { EmployeeDocumentsController } from './employee-documents.controller';
import { EmployeeDocumentsService } from './employee-documents.service';

/* HR-004a — employee documents (copy-adapted from the Operations doc-control
   engine). Three resources: document types, the requirements matrix, and the
   records. PrismaService/RlsService/StorageService come from their @Global
   modules, so nothing extra is imported here. */
@Module({
  controllers: [
    EmployeeDocumentTypesController,
    EmployeeDocumentRequirementsController,
    EmployeeDocumentsController,
  ],
  providers: [
    EmployeeDocumentTypesService,
    EmployeeDocumentRequirementsService,
    EmployeeDocumentsService,
  ],
  exports: [
    EmployeeDocumentTypesService,
    EmployeeDocumentRequirementsService,
    EmployeeDocumentsService,
  ],
})
export class EmployeeDocumentsModule {}
