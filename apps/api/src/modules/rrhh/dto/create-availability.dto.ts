import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { AvailabilityStatus } from '@prisma/client';

/**
 * Creates an availability row for an employee on a given date. Absence of a row
 * for a date means the employee is DISPONIBLE; rows usually carry a non-default
 * status (VACACIONES / LICENCIA / CAPACITACION / ASIGNADO / DIA_LIBRE).
 */
export class CreateAvailabilityDto {
  @IsUUID()
  employeeId: string;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(AvailabilityStatus)
  status?: AvailabilityStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}
