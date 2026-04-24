import { IsEnum, IsString } from 'class-validator';
import { MovementType } from '@prisma/client';

export class TestCategoryRuleDto {
  @IsString()
  rut!: string;

  @IsString()
  razonSocial!: string;

  @IsEnum(MovementType)
  movementType!: MovementType;
}
