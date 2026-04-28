import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/* POST /api/operations/documents/:id/archive — body. The reason is
   recorded in `notes` and becomes part of the audit trail. */
export class ArchiveDocumentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
