import { IsEnum, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { DocumentRecordStatus } from '@prisma/client';

/* Body for POST /api/operations/documents/:id/supersede. assetId and
   documentTypeId are inherited from the document being superseded — the
   client cannot move a document to a different asset/type via this flow. */
export class SupersedeDocumentDto {
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

  @IsOptional()
  @IsEnum(DocumentRecordStatus)
  setStatus?: DocumentRecordStatus;
}
