import { IsEnum, IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { CertificationStatus } from '@prisma/client';

/* Body for PATCH /api/rrhh/certifications/:id. status accepts only the persisted
   values (VIGENTE | ANULADA) — POR_VENCER/VENCIDA are DERIVED on read, never set
   directly. The "anular" action is also exposed as a dedicated endpoint. */
export class UpdateCertificationDto {
  @IsOptional()
  @IsISO8601()
  issueDate?: string;

  @IsOptional()
  @IsISO8601()
  expiryDate?: string;

  @IsOptional()
  @IsUUID()
  documentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  clientOrSite?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsEnum(CertificationStatus)
  status?: CertificationStatus;
}
