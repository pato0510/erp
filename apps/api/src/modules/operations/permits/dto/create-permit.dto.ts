import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PermitStatus } from '@prisma/client';

/* Multipart body for POST /api/operations/permits. The file itself
   comes through Multer; everything else is here. Exactly one target
   (assetId / locationId) must be set — validated at the service. */
export class CreatePermitDto {
  @IsUUID()
  permitTypeId: string;

  @IsOptional()
  @IsUUID()
  assetId?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  permitNumber: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  issuingAuthority?: string;

  @IsOptional()
  @IsISO8601()
  issueDate?: string;

  @IsOptional()
  @IsISO8601()
  expirationDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  scope?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  /* DRAFT or PENDING_REVIEW; other states go through workflow
     endpoints. Defaults to DRAFT in the service. */
  @IsOptional()
  @IsEnum(PermitStatus)
  setStatus?: PermitStatus;
}
