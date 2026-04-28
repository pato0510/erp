import { IsString, MaxLength, MinLength } from 'class-validator';

export class RevokeExceptionDto {
  @IsString()
  @MinLength(10, { message: 'Indica un motivo de revocación (mínimo 10 caracteres).' })
  @MaxLength(2000)
  revokedReason: string;
}
