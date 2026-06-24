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

/* Body for PATCH /api/rrhh/document-types/:id. Every field optional; the
   service only writes the keys that are present. */
export class UpdateEmployeeDocumentTypeDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsEnum(EmployeeDocCategory)
  category?: EmployeeDocCategory;

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

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
