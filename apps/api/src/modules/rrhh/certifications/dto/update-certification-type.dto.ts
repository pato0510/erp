import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { CertificationCategory } from '@prisma/client';

/* Body for PATCH /api/rrhh/certification-types/:id. Every field optional. */
export class UpdateCertificationTypeDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsEnum(CertificationCategory)
  category?: CertificationCategory;

  @IsOptional()
  @IsInt()
  @Min(1)
  defaultValidityDays?: number;

  @IsOptional()
  @IsBoolean()
  requiresExpiry?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  issuingEntity?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
