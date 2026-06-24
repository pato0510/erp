import { IsBooleanString, IsEnum, IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { DocumentRecordStatus } from '@prisma/client';

/* The body of POST /api/rrhh/documents (multipart). The file comes through
   Multer; everything else is here. issueDate/expiryDate stay strings — the
   service parses them after validation. Copy-adapted from the Operations
   CreateDocumentDto (assetId→employeeId). */
export class CreateEmployeeDocumentDto {
  @IsUUID()
  employeeId: string;

  @IsUUID()
  documentTypeId: string;

  @IsOptional()
  @IsISO8601()
  issueDate?: string;

  @IsOptional()
  @IsISO8601()
  expiryDate?: string;

  /* Status to land in after upload: DRAFT (default) or PENDING_REVIEW. Anything
     else is rejected at the service layer (workflow states are reached via the
     approve/reject endpoints). */
  @IsOptional()
  @IsEnum(DocumentRecordStatus)
  setStatus?: DocumentRecordStatus;

  /* When 'true', skip the "already-approved" 409 conflict guard and create a
     new version side-by-side. Multipart bodies arrive as strings. */
  @IsOptional()
  @IsBooleanString()
  forceNewVersion?: string;
}
