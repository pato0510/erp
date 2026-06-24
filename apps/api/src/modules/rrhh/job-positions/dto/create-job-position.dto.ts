import { AreaRRHH } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateJobPositionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @IsEnum(AreaRRHH)
  area: AreaRRHH;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  // Free String[] for now — validated against the cert enum / service catalog /
  // doc-type catalog once those RRHH modules land (HR-003+).
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredCertTypes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredDocTypes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledServices?: string[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
