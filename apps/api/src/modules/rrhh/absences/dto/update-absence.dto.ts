import {
  IsBoolean,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

/* Body for PATCH /api/rrhh/absences/:id (only while not finalised — i.e. not
   RECHAZADO/CANCELADO). All fields optional. */
export class UpdateAbsenceDto {
  @IsOptional()
  @IsUUID()
  absenceTypeId?: string;

  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;

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
