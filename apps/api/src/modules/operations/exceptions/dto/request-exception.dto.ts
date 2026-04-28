import { IsISO8601, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/* Body for POST /api/operations/exceptions. The reason is mandatory
   (min 20 chars) so admins reviewing the request always have context. */
export class RequestExceptionDto {
  @IsUUID()
  assetId: string;

  @IsString()
  @MinLength(20, { message: 'La justificación debe tener al menos 20 caracteres.' })
  @MaxLength(2000)
  reason: string;

  @IsISO8601()
  proposedValidUntil: string;
}
