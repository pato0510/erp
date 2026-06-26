import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { TerminationCausal } from '@prisma/client';

/* Body for POST /api/rrhh/terminations (the explicit "registrar finiquito"
   action). The service RE-COMPUTES the breakdown from these inputs (it does not
   trust client-sent amounts) and persists the result. markEmployeeDesvinculado,
   when true, also flips the employee status in the same tx. */
export class CreateTerminationDto {
  @IsUUID()
  employeeId: string;

  @IsEnum(TerminationCausal)
  causal: TerminationCausal;

  @IsISO8601()
  terminationDate: string;

  @IsNumber()
  @Min(0)
  ufValue: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  baseMonthly?: number;

  @IsBoolean()
  avisoPrevioDado: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  feriadoDias?: number;

  @IsOptional()
  @IsBoolean()
  markEmployeeDesvinculado?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
