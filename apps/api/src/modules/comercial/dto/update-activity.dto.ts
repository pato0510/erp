import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { CrmActivityType } from '@prisma/client';

/** Partial update of a CrmActivity (e.g. mark a TAREA as done). */
export class UpdateActivityDto {
  @IsOptional()
  @IsEnum(CrmActivityType)
  type?: CrmActivityType;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  content?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsBoolean()
  done?: boolean;
}
