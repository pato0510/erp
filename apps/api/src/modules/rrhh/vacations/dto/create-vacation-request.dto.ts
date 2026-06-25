import { IsISO8601, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

/* Body for POST /api/rrhh/vacations. diasHabiles is normally COMPUTED from the
   date range (Mon–Fri inclusive); an admin may override it for festivos. */
export class CreateVacationRequestDto {
  @IsUUID()
  employeeId: string;

  @IsISO8601()
  startDate: string;

  @IsISO8601()
  endDate: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  diasHabiles?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
