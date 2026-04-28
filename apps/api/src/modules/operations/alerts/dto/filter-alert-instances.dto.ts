import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { AlertInstanceStatus, AlertSeverity, AlertTriggerType } from '@prisma/client';

export class FilterAlertInstancesDto {
  @IsOptional()
  @IsEnum(AlertInstanceStatus)
  status?: AlertInstanceStatus;

  @IsOptional()
  @IsEnum(AlertSeverity)
  severity?: AlertSeverity;

  @IsOptional()
  @IsEnum(AlertTriggerType)
  triggerType?: AlertTriggerType;

  @IsOptional()
  @IsUUID()
  assetId?: string;

  @IsOptional()
  @IsUUID()
  documentTypeId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class ResolveAlertInstanceDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  reason?: string;
}

export class DismissAlertInstanceDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  reason: string;
}

export class BulkAlertIdsDto {
  ids: string[];
  reason?: string;
}
