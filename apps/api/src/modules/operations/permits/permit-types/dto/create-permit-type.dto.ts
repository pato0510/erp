import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { DocumentCriticality, PermitCategory } from '@prisma/client';

export class CreatePermitTypeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsString()
  @MinLength(2)
  @MaxLength(40)
  code: string;

  @IsEnum(PermitCategory)
  category: PermitCategory;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  issuingAuthority?: string;

  @IsOptional()
  @IsBoolean()
  hasExpiration?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  defaultValidityDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  alertDaysBefore?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  criticalAlertDaysBefore?: number;

  @IsEnum(DocumentCriticality)
  criticality: DocumentCriticality;

  @IsOptional()
  @IsBoolean()
  blocksOperation?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  icon?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;
}
