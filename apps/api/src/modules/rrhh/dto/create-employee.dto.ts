import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ContractType } from '@prisma/client';

/**
 * Creates an Employee together with its initial contract. The contract block is
 * required so the worker has an active sueldoBruto from day one (the dashboard
 * masa salarial and the liquidación endpoints depend on it).
 */
export class CreateEmployeeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  rut: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombres: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  apellidos: string;

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

  @IsDateString()
  fechaIngreso: string;

  @IsString()
  @IsNotEmpty()
  area: string;

  @IsString()
  @IsNotEmpty()
  cargo: string;

  // ── Initial contract ──────────────────────────────────────────────
  @IsEnum(ContractType)
  tipoContrato: ContractType;

  @IsNumber()
  @Min(0)
  sueldoBruto: number;

  @IsOptional()
  @IsString()
  jornada?: string;

  @IsString()
  @IsNotEmpty()
  afp: string;

  @IsString()
  @IsNotEmpty()
  salud: string;

  @IsOptional()
  @IsDateString()
  fechaInicioContrato?: string;

  @IsOptional()
  @IsDateString()
  fechaFinContrato?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
