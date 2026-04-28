import { IsEnum, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { DocumentRecordStatus } from '@prisma/client';

/* PATCH /api/operations/documents/:id — metadata-only updates. The file
   itself can't be replaced; that requires a new version (POST again). */
export class UpdateDocumentDto {
  @IsOptional()
  @IsISO8601()
  issueDate?: string;

  @IsOptional()
  @IsISO8601()
  expirationDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  /* Restricted: from DRAFT a user can move to PENDING_REVIEW. Other
     transitions belong to the workflow endpoints (OPS-015). */
  @IsOptional()
  @IsEnum(DocumentRecordStatus)
  status?: DocumentRecordStatus;
}
