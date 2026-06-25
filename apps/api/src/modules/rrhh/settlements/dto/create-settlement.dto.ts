import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { SettlementStatus } from '@prisma/client';

/* Body for POST /api/rrhh/settlements. ALL monetary values are ENTERED by the
   admin — the system does NOT compute the liquidación. Amounts must be >= 0;
   periodMonth 1..12; the [company,employee,year,month] uniqueness is enforced by
   the DB. */
export class CreateSettlementDto {
  @IsUUID()
  employeeId: string;

  @IsInt()
  @Min(2000)
  @Max(2100)
  periodYear: number;

  @IsInt()
  @Min(1)
  @Max(12)
  periodMonth: number;

  // ── Haberes (entered) ──
  @IsNumber() @Min(0) haberesImponibles: number;
  @IsNumber() @Min(0) haberesNoImponibles: number;
  @IsOptional() @IsNumber() @Min(0) sueldoBase?: number;
  @IsOptional() @IsNumber() @Min(0) gratificacion?: number;
  @IsNumber() @Min(0) totalHaberes: number;

  // ── Descuentos (entered) ──
  @IsNumber() @Min(0) descUAfp: number;
  @IsNumber() @Min(0) descSalud: number;
  @IsNumber() @Min(0) descAfc: number;
  @IsNumber() @Min(0) descImpuestoUnico: number;
  @IsNumber() @Min(0) otrosDescuentos: number;
  @IsNumber() @Min(0) totalDescuentos: number;

  @IsNumber() @Min(0) liquidoPagado: number;

  // ── Employer aportes (entered; summed into costo empresa) ──
  @IsOptional() @IsNumber() @Min(0) aporteAfcEmpleador?: number;
  @IsOptional() @IsNumber() @Min(0) aporteSis?: number;
  @IsOptional() @IsNumber() @Min(0) aporteMutual?: number;
  @IsOptional() @IsNumber() @Min(0) otrosAportesEmpleador?: number;
  @IsOptional() @IsNumber() @Min(0) costoEmpresa?: number;

  @IsOptional() @IsString() @MaxLength(80) afpName?: string;

  @IsOptional() @IsEnum(SettlementStatus) status?: SettlementStatus;

  @IsOptional() @IsUUID() documentId?: string;

  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
