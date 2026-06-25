import { IsInt, Min } from 'class-validator';

/* Body for PATCH /api/rrhh/vacations/settings/:employeeId — the manual feriado
   progresivo (días adicionales) the HR admin sets per employee. */
export class VacationSettingsDto {
  @IsInt()
  @Min(0)
  diasAdicionalesFeriado: number;
}
