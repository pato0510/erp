import { IsBoolean, IsEnum, IsISO8601, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';
import { TerminationCausal } from '@prisma/client';

/* Body for POST /api/rrhh/terminations/estimate (EPHEMERAL — never persists).
   baseMonthly defaults from EmployeeCompensation when omitted; ufValue is an
   editable input (no live feed); feriadoDias defaults from the HR-011 saldo when
   omitted. */
export class EstimateTerminationDto {
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
}
