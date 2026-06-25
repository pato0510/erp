import {
  IsBoolean,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/* Body for POST /api/rrhh/payroll-parameters. Every tope/tasa is DATA (per
   period). Decimals arrive as numbers and Prisma stores them at the column
   scale. */
export class CreateParameterSetDto {
  @IsString()
  @MaxLength(60)
  name: string;

  @IsISO8601()
  effectiveFrom: string;

  @IsOptional()
  @IsISO8601()
  effectiveTo?: string;

  @IsNumber()
  @Min(0)
  topeImponibleAfpSaludUf: number;

  @IsNumber()
  @Min(0)
  topeImponibleAfcUf: number;

  @IsNumber()
  @Min(0)
  tasaAfpObligatoria: number;

  @IsNumber()
  @Min(0)
  tasaSalud: number;

  @IsNumber()
  @Min(0)
  tasaAfcIndefinidoTrabajador: number;

  @IsNumber()
  @Min(0)
  tasaAfcIndefinidoEmpleador: number;

  @IsNumber()
  @Min(0)
  tasaAfcPlazoFijoEmpleador: number;

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
