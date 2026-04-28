import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { WorkPermitStatus } from '@prisma/client';

export class FilterWorkPermitsDto {
  @IsOptional()
  @IsString()
  search?: string;

  /* Comma-separated repeat list — class-validator will see an array
     once the controller @Query() splits it, but we also accept comma
     strings via Transform so URL building stays simple. */
  @IsOptional()
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(',').filter(Boolean)
        : value,
  )
  @IsArray()
  @IsEnum(WorkPermitStatus, { each: true })
  status?: WorkPermitStatus[];

  @IsOptional()
  @IsUUID()
  permitTypeId?: string;

  @IsOptional()
  @IsUUID()
  supervisorId?: string;

  @IsOptional()
  @IsUUID()
  requestedBy?: string;

  @IsOptional()
  @IsUUID()
  assetId?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @IsOptional()
  @IsISO8601()
  dateTo?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;

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
