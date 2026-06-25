import {
  IsBoolean,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/* Body for PATCH /api/rrhh/payroll-parameters/:id. Every field optional. */
export class UpdateParameterSetDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string;

  @IsOptional()
  @IsISO8601()
  effectiveTo?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  topeImponibleAfpSaludUf?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  topeImponibleAfcUf?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  tasaAfpObligatoria?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  tasaSalud?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  tasaAfcIndefinidoTrabajador?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  tasaAfcIndefinidoEmpleador?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  tasaAfcPlazoFijoEmpleador?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  tasaSis?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
