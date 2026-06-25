import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

/* Body for POST /api/rrhh/payroll-parameters/:id/afp. comisionPorcentaje may be
   null (the admin completes the unverified ones later — we never invent it). */
export class CreateAfpRateDto {
  @IsString()
  @MaxLength(80)
  afpName: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsNumber()
  @Min(0)
  comisionPorcentaje?: number | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
