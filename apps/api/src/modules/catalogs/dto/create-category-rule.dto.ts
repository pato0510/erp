import { CategoryRuleMovementType, CategoryRuleType } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateCategoryRuleDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsEnum(CategoryRuleType)
  ruleType!: CategoryRuleType;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((dto) => dto.ruleType !== CategoryRuleType.DEFAULT || dto.matchValue != null)
  @IsString()
  @MinLength(1, { message: 'Ingresa un valor de coincidencia para la regla.' })
  @MaxLength(200)
  matchValue?: string | null;

  @IsUUID()
  categoryId!: string;

  @IsEnum(CategoryRuleMovementType)
  movementType!: CategoryRuleMovementType;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
