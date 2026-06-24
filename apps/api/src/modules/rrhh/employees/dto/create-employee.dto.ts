import { AreaRRHH, ContractType, EmployeeStatus } from '@prisma/client';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateEmployeeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName: string;

  // Validated Módulo-11 (@erp/utils validateRut) at the service layer.
  @IsString()
  @IsNotEmpty()
  rut: string;

  // Optional login link — field staff have no user.
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  nationality?: string;

  @IsOptional()
  @IsEmail()
  personalEmail?: string;

  @IsOptional()
  @IsEmail()
  companyEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  emergencyContact?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  emergencyPhone?: string;

  @IsOptional()
  @IsUUID()
  jobPositionId?: string;

  @IsEnum(AreaRRHH)
  area: AreaRRHH;

  @IsOptional()
  @IsUUID()
  supervisorId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  base?: string;

  @IsDateString()
  hireDate: string;

  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  @IsOptional()
  @IsEnum(ContractType)
  contractType?: ContractType;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
