import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

/* PATCH body for the singleton CompanyAlertSettings row. All fields are
   optional so a partial update works. */
export class UpdateAlertSettingsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  defaultDaysBefore?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  defaultCriticalDaysBefore?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  defaultBlockingDaysBefore?: number;

  @IsOptional()
  @IsBoolean()
  enableAutoBlocking?: boolean;

  @IsOptional()
  @IsBoolean()
  enableEmailNotifications?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  defaultEscalationDays?: number;
}
