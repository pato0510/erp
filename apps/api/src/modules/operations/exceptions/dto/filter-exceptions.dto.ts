import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { ExceptionStatus } from '@prisma/client';

export class FilterExceptionsDto {
  @IsOptional()
  @IsEnum(ExceptionStatus)
  status?: ExceptionStatus;

  @IsOptional()
  @IsUUID()
  assetId?: string;

  @IsOptional()
  @IsUUID()
  requestedBy?: string;

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
