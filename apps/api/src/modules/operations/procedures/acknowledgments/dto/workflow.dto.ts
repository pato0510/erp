import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AcknowledgmentStatus } from '@prisma/client';

export class AcknowledgeDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ExemptUserDto {
  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  reason: string;
}

export class FilterAcknowledgmentsDto {
  @IsOptional()
  @IsEnum(AcknowledgmentStatus)
  status?: AcknowledgmentStatus;

  @IsOptional()
  @IsUUID()
  procedureId?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  dueWithinDays?: number;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  overdueOnly?: boolean;
}
