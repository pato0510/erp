import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ProcedureCategory } from '@prisma/client';

const arrayFromForm = ({ value }: { value: unknown }) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    /* multipart/form-data may send the same field twice as a string
       or as a JSON array depending on the client. Try JSON first,
       fall back to comma-split for the simple case. */
    if (value.startsWith('[')) {
      try {
        return JSON.parse(value);
      } catch {
        /* swallow */
      }
    }
    return value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return value;
};

const boolFromForm = ({ value }: { value: unknown }) =>
  value === true || value === 'true' || value === 'on';

export class CreateProcedureDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  code: string;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsEnum(ProcedureCategory)
  category: ProcedureCategory;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  version?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  changelog?: string;

  /* String[] — comes from multipart as repeated fields. We
     normalise via the transformer above. */
  @IsOptional()
  @Transform(arrayFromForm)
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(40)
  keywords?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  scope?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  estimatedReadingMinutes?: number;

  @IsOptional()
  @Transform(boolFromForm)
  @IsBoolean()
  requiresAcknowledgment?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  acknowledgmentDeadlineDays?: number;

  @IsOptional()
  @Transform(arrayFromForm)
  @IsArray()
  @IsUUID('all', { each: true })
  applicableAssetTypeIds?: string[];

  @IsOptional()
  @Transform(arrayFromForm)
  @IsArray()
  @IsUUID('all', { each: true })
  applicableAssetIds?: string[];

  @IsOptional()
  @Transform(arrayFromForm)
  @IsArray()
  @IsUUID('all', { each: true })
  applicableLocationIds?: string[];

  @IsOptional()
  @Transform(arrayFromForm)
  @IsArray()
  @IsString({ each: true })
  applicableRoles?: string[];

  /* When true the create call lands the row directly in
     IN_REVIEW instead of DRAFT — UX nicety for the "I have the
     final PDF, send it to review immediately" flow. */
  @IsOptional()
  @Transform(boolFromForm)
  @IsBoolean()
  submitImmediately?: boolean;
}
