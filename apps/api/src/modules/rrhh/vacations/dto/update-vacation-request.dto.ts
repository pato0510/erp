import { IsISO8601, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/* Body for PATCH /api/rrhh/vacations/:id (only while PENDIENTE). If the dates
   change, diasHabiles is recomputed unless explicitly provided (admin festivo
   override). */
export class UpdateVacationRequestDto {
  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  diasHabiles?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
