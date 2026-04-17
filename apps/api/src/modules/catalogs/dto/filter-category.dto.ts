import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CategoryType } from '@prisma/client';
import { Transform } from 'class-transformer';

export class FilterCategoryDto {
  @IsOptional()
  @IsEnum(CategoryType)
  type?: CategoryType;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  isActive?: boolean;

  @IsOptional()
  @IsString()
  search?: string;
}
