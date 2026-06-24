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
import { EmployeeDocCategory } from '@prisma/client';

/* Body for POST /api/rrhh/document-types — RRHH's own document-type catalog
   (separate from OperationalDocumentType, recon R1). */
export class CreateEmployeeDocumentTypeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsEnum(EmployeeDocCategory)
  category: EmployeeDocCategory;

  @IsOptional()
  @IsInt()
  @Min(1)
  defaultValidityDays?: number;

  @IsOptional()
  @IsBoolean()
  requiresExpiry?: boolean;

  @IsOptional()
  @IsBoolean()
  isMandatoryDefault?: boolean;
}
