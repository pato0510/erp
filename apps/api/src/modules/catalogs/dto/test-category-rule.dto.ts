import { IsEnum, IsString, IsOptional, MaxLength } from 'class-validator';
import { MovementType } from '@prisma/client';

export class TestCategoryRuleDto {
  @IsString()
  rut!: string;

  @IsString()
  razonSocial!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  giro?: string;

  @IsEnum(MovementType)
  movementType!: MovementType;
}
