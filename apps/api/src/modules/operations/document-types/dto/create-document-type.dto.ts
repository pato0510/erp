import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { DocumentCategory, DocumentCriticality } from '@prisma/client';

export class CreateDocumentTypeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @Matches(/^[A-Z0-9_-]+$/, {
    message: 'code must be uppercase letters, digits, underscore or dash only',
  })
  code: string;

  @IsEnum(DocumentCategory)
  category: DocumentCategory;

  @IsEnum(DocumentCriticality)
  criticality: DocumentCriticality;

  @IsOptional()
  @IsBoolean()
  hasExpiration?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  defaultValidityDays?: number;

  @IsOptional()
  @IsBoolean()
  blocksOperation?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  alertDaysBefore?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  criticalAlertDaysBefore?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'color must be a hex color (e.g. #4CAF50)' })
  color?: string;
}
