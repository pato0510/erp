import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { LicenseStatus, LicenseType } from '@prisma/client';

export class CreateLicenseDto {
  @IsUUID()
  employeeId: string;

  @IsEnum(LicenseType)
  tipo: LicenseType;

  @IsDateString()
  fechaInicio: string;

  @IsDateString()
  fechaFin: string;

  @IsInt()
  @Min(1)
  dias: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  folio?: string;

  @IsOptional()
  @IsEnum(LicenseStatus)
  estado?: LicenseStatus;
}
