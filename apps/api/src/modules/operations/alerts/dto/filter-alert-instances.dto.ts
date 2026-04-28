import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { AlertInstanceStatus, AlertSeverity, AlertTriggerType } from '@prisma/client';

/* OPS-021 — comma-or-array coercion for query-string multi-selects.
   Accepts ?severities=CRITICAL,BLOCKING and ?severities=CRITICAL&
   severities=BLOCKING. Empty strings are dropped so a cleared filter
   doesn't generate spurious enum-validation failures. */
const arrayTransform = ({ value }: { value: unknown }): unknown => {
  if (value == null) return undefined;
  if (Array.isArray(value)) {
    return value
      .flatMap((v) => (typeof v === 'string' ? v.split(',') : []))
      .map((v) => v.trim())
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return undefined;
};

export class FilterAlertInstancesDto {
  /* Free-text search across alert title, asset code/name and document
     type name. */
  @IsOptional()
  @IsString()
  search?: string;

  /* Single-value filters kept for backward compatibility with the OPS-019
     callers (badge polling, asset detail). The array versions take
     precedence when both are present. */
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
  @Transform(arrayTransform)
  @IsArray()
  @IsEnum(AlertInstanceStatus, { each: true })
  statuses?: AlertInstanceStatus[];

  @IsOptional()
  @Transform(arrayTransform)
  @IsArray()
  @IsEnum(AlertSeverity, { each: true })
  severities?: AlertSeverity[];

  @IsOptional()
  @Transform(arrayTransform)
  @IsArray()
  @IsEnum(AlertTriggerType, { each: true })
  triggerTypes?: AlertTriggerType[];

  @IsOptional()
  @IsUUID()
  assetId?: string;

  @IsOptional()
  @IsUUID()
  documentTypeId?: string;

  @IsOptional()
  @IsISO8601()
  triggeredFrom?: string;

  @IsOptional()
  @IsISO8601()
  triggeredTo?: string;

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
