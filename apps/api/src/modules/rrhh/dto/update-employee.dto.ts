import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ContractType, EmployeeStatus } from '@prisma/client';

/**
 * Partial update of an Employee. If any contract field is provided we update the
 * active contract in place (demo-simple — no contract versioning).
 */
export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  nombres?: string;

  @IsOptional()
  @IsString()
  apellidos?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsString()
  direccion?: string;

  @IsOptional()
  @IsString()
  comuna?: string;

  @IsOptional()
  @IsString()
  ciudad?: string;

  @IsOptional()
  @IsDateString()
  fechaNacimiento?: string;

  @IsOptional()
  @IsDateString()
  fechaIngreso?: string;

  @IsOptional()
  @IsString()
  area?: string;

  @IsOptional()
  @IsString()
  cargo?: string;

  @IsOptional()
  @IsEnum(EmployeeStatus)
  estado?: EmployeeStatus;

  // ── Active-contract fields (optional) ─────────────────────────────
  @IsOptional()
  @IsEnum(ContractType)
  tipoContrato?: ContractType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sueldoBruto?: number;

  @IsOptional()
  @IsString()
  jornada?: string;

  @IsOptional()
  @IsString()
  afp?: string;

  @IsOptional()
  @IsString()
  salud?: string;
}
