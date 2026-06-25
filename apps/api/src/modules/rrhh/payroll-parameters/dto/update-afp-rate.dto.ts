import { IsBoolean, IsNumber, IsOptional, Min, ValidateIf } from 'class-validator';

/* Body for PATCH /api/rrhh/payroll-parameters/afp/:afpId. comisionPorcentaje may
   be set to a number OR explicitly null (clears it back to "por completar"). */
export class UpdateAfpRateDto {
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsNumber()
  @Min(0)
  comisionPorcentaje?: number | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
