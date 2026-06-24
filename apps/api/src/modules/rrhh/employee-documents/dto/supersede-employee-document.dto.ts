import { IsEnum, IsISO8601, IsOptional } from 'class-validator';
import { DocumentRecordStatus } from '@prisma/client';

/* Body for POST /api/rrhh/documents/:id/supersede. employeeId and
   documentTypeId are inherited from the document being superseded — the client
   cannot move a document to a different employee/type via this flow. */
export class SupersedeEmployeeDocumentDto {
  @IsOptional()
  @IsISO8601()
  issueDate?: string;

  @IsOptional()
  @IsISO8601()
  expiryDate?: string;

  @IsOptional()
  @IsEnum(DocumentRecordStatus)
  setStatus?: DocumentRecordStatus;
}
