import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { AlertSeverity } from '@prisma/client';

/* Query string for GET /api/operations/alert-rules. */
export class FilterAlertRulesDto {
  @IsOptional()
  @IsUUID()
  documentTypeId?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsEnum(AlertSeverity)
  severity?: AlertSeverity;
}
