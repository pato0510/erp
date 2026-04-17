import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { MovementType } from '@prisma/client';

export class CreateCommitmentDto {
  @IsEnum(MovementType)
  type: MovementType;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsDateString()
  dueDate: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsOptional()
  @IsUUID()
  counterpartyId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsUUID()
  fiscalPeriodId: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
