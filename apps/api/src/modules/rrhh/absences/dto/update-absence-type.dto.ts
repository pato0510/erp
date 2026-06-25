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
import { AbsenceCategory, AbsenceDayUnit } from '@prisma/client';

/* Body for PATCH /api/rrhh/absence-types/:id. Every field optional. */
export class UpdateAbsenceTypeDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsEnum(AbsenceCategory)
  category?: AbsenceCategory;

  @IsOptional()
  @IsInt()
  @Min(0)
  daysDefault?: number;

  @IsOptional()
  @IsEnum(AbsenceDayUnit)
  unit?: AbsenceDayUnit;

  @IsOptional()
  @IsBoolean()
  withPay?: boolean;

  @IsOptional()
  @IsBoolean()
  isLegal?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
