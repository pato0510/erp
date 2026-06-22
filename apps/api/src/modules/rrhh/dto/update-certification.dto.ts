import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { CertificationType } from '@prisma/client';

/** Partial update of a certification. `status` stays derived from `expiryDate`. */
export class UpdateCertificationDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsEnum(CertificationType)
  type?: CertificationType;

  @IsOptional()
  @IsDateString()
  issuedDate?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsOptional()
  @IsString()
  documentRef?: string;
}
