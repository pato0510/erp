import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { WorkPermitCategory } from '@prisma/client';

export class CreateWorkPermitTypeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsString()
  @MinLength(2)
  @MaxLength(40)
  code: string;

  @IsEnum(WorkPermitCategory)
  category: WorkPermitCategory;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(72)
  maxDurationHours?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  @ArrayMaxSize(8)
  requiredRoles?: string[];

  @IsOptional()
  @IsBoolean()
  requiresMedicalAptitude?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresSpecificTraining?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresGasMeasurement?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresIsolation?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(40)
  defaultRisks?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(40)
  defaultControls?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(60)
  icon?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
