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

/* Body for POST /api/rrhh/certification-types — the configurable cert/habilitación
   type catalog (seeded via /seed-recommended). Copy-adapted from the HR-004
   document-type DTO. */
export class CreateCertificationTypeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

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
}
