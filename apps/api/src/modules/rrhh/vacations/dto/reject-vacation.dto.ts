import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/* Body for POST /api/rrhh/vacations/:id/reject. A reason is required so the
   requester knows why. */
export class RejectVacationDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(5, { message: 'El motivo debe tener al menos 5 caracteres.' })
  @MaxLength(2000)
  reason: string;
}
