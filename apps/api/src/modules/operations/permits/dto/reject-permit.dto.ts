import { IsString, MaxLength, MinLength } from 'class-validator';

export class RejectPermitDto {
  @IsString()
  @MinLength(10, { message: 'Indica un motivo de rechazo (mínimo 10 caracteres).' })
  @MaxLength(2000)
  reason: string;
}
