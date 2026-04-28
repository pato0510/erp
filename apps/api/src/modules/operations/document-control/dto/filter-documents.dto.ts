import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { DocumentRecordStatus } from '@prisma/client';

export class FilterDocumentRecordsDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID()
  assetId?: string;

  @IsOptional()
  @IsUUID()
  documentTypeId?: string;

  @IsOptional()
  @IsEnum(DocumentRecordStatus)
  status?: DocumentRecordStatus;

  @IsOptional()
  @IsISO8601()
  expirationFrom?: string;

  @IsOptional()
  @IsISO8601()
  expirationTo?: string;

  /* "Documents expiring in the next N days" — convenience filter for the
     "por vencer" quick chip on the frontend. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expiringInDays?: number;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isExpired?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;

  /* When false (default), REPLACED versions are hidden from the list so the
     central documents page only shows current versions. The frontend
     toggle "Mostrar documentos reemplazados" sets this to true. An explicit
     status=REPLACED filter overrides this default — operators querying the
     replaced bucket directly should always see what they asked for. */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeReplaced?: boolean;

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
