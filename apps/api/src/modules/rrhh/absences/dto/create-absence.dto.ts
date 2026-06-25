import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { AbsenceCategory } from '@prisma/client';

/* Body for POST /api/rrhh/absences (permiso OR licencia — unified). A permiso
   defaults to PENDIENTE; a licencia may be registered directly as APROBADO. Only
   PENDIENTE/APROBADO are valid creation statuses (workflow reaches the rest). */
export class CreateAbsenceDto {
  @IsUUID()
  employeeId: string;

  @IsEnum(AbsenceCategory)
  category: AbsenceCategory;

  @IsOptional()
  @IsUUID()
  absenceTypeId?: string;

  @IsISO8601()
  startDate: string;

  @IsISO8601()
  endDate: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  dias?: number;

  @IsOptional()
  @IsBoolean()
  withPay?: boolean;

  @IsOptional()
  @IsBoolean()
  blocksAvailability?: boolean;

  @IsOptional()
  @IsIn(['PENDIENTE', 'APROBADO'])
  status?: 'PENDIENTE' | 'APROBADO';

  /* licencia-specific (free text — NO subsidy calc). */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  medicalFolio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  healthEntity?: string;

  @IsOptional()
  @IsUUID()
  documentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
