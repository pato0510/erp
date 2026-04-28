import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/* POST /api/operations/documents/:id/reject — body. The reason is required
   (min 10 chars) so the uploader has actionable feedback to fix the
   document and resubmit. */
export class RejectDocumentDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(10, { message: 'El motivo debe tener al menos 10 caracteres.' })
  @MaxLength(2000)
  reason: string;
}
