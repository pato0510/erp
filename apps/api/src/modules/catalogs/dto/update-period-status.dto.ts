import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PeriodStatus } from '@prisma/client';

export class UpdatePeriodStatusDto {
  @IsEnum(PeriodStatus)
  status: PeriodStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}
