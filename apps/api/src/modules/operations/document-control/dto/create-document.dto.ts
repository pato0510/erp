import {
  IsBooleanString,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { DocumentRecordStatus } from '@prisma/client';

/* The body of POST /api/operations/documents (multipart). The file itself
   comes through Multer; everything else is here. issueDate/expirationDate
   stay strings — the service parses them after validation. */
export class CreateDocumentDto {
  @IsUUID()
  assetId: string;

  @IsUUID()
  documentTypeId: string;

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

  /* Status to land in after upload. The wizard exposes "Guardar como
     borrador" (DRAFT) and "Guardar y enviar a revisión" (PENDING_REVIEW).
     Anything beyond those is rejected at the service layer. */
  @IsOptional()
  @IsEnum(DocumentRecordStatus)
  setStatus?: DocumentRecordStatus;

  /* When 'true', skip the "already-approved" 409 conflict guard (OPS-016)
     and create a new version side-by-side with the existing approved one.
     Multipart bodies always arrive as strings, so we accept the string form
     and parse it in the service. */
  @IsOptional()
  @IsBooleanString()
  forceNewVersion?: string;
}
