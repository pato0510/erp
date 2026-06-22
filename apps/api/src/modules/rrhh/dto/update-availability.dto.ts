import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { AvailabilityStatus } from '@prisma/client';

/** Partial update of an availability row. */
export class UpdateAvailabilityDto {
  @IsOptional()
  @IsDateString()
  date?: string;

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
