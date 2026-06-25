import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/* Body for POST /api/rrhh/absences/:id/reject. */
export class RejectAbsenceDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(5, { message: 'El motivo debe tener al menos 5 caracteres.' })
  @MaxLength(2000)
  reason: string;
}
