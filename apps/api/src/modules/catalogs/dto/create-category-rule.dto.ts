import { CategoryRuleMovementType, CategoryRuleType } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateCategoryRuleDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsEnum(CategoryRuleType)
  ruleType!: CategoryRuleType;

  @IsOptional()
  @IsString()
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
