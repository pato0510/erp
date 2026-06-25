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

/* Body for POST /api/rrhh/absence-types — the configurable permit/licencia type
   catalog (seeded with the Chilean legal permits via /seed-recommended). */
export class CreateAbsenceTypeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

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
}
