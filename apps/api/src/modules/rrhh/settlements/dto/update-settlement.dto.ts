import { IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

/* Body for PATCH /api/rrhh/settlements/:id (while BORRADOR/EMITIDA). All fields
   optional; amounts are still ENTERED, never recomputed. Period + employee are
   not editable here (delete + re-create for a different period). */
export class UpdateSettlementDto {
  @IsOptional() @IsNumber() @Min(0) haberesImponibles?: number;
  @IsOptional() @IsNumber() @Min(0) haberesNoImponibles?: number;
  @IsOptional() @IsNumber() @Min(0) sueldoBase?: number;
  @IsOptional() @IsNumber() @Min(0) gratificacion?: number;
  @IsOptional() @IsNumber() @Min(0) totalHaberes?: number;

  @IsOptional() @IsNumber() @Min(0) descUAfp?: number;
  @IsOptional() @IsNumber() @Min(0) descSalud?: number;
  @IsOptional() @IsNumber() @Min(0) descAfc?: number;
  @IsOptional() @IsNumber() @Min(0) descImpuestoUnico?: number;
  @IsOptional() @IsNumber() @Min(0) otrosDescuentos?: number;
  @IsOptional() @IsNumber() @Min(0) totalDescuentos?: number;

  @IsOptional() @IsNumber() @Min(0) liquidoPagado?: number;

  @IsOptional() @IsNumber() @Min(0) aporteAfcEmpleador?: number;
  @IsOptional() @IsNumber() @Min(0) aporteSis?: number;
  @IsOptional() @IsNumber() @Min(0) aporteMutual?: number;
  @IsOptional() @IsNumber() @Min(0) otrosAportesEmpleador?: number;
  @IsOptional() @IsNumber() @Min(0) costoEmpresa?: number;

  @IsOptional() @IsString() @MaxLength(80) afpName?: string;

  @IsOptional() @IsUUID() documentId?: string;

  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
