import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { AlertSeverity } from '@prisma/client';

class AlertChannelsDto {
  @IsBoolean()
  inApp: boolean;

  @IsBoolean()
  email: boolean;
}

/* Body of POST /api/operations/alert-rules. documentTypeId is optional —
   omit it for a "global" rule that applies to every document type. */
export class CreateAlertRuleDto {
  @IsOptional()
  @IsUUID()
  documentTypeId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  daysBeforeExpiration: number;

  @IsEnum(AlertSeverity)
  severity: AlertSeverity;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AlertChannelsDto)
  channels?: AlertChannelsDto;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  targetRoles?: string[];

  @IsOptional()
  @IsBoolean()
  notifyAssignedUser?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyOperationalSupervisor?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  escalateAfterDays?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  escalateToRoles?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
