import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { CertificationType } from '@prisma/client';

/**
 * Creates a staff certification. `status` is intentionally NOT accepted — it is
 * derived from `expiryDate` in the service layer (mirrors employee documents).
 */
export class CreateCertificationDto {
  @IsUUID()
  employeeId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(CertificationType)
  type: CertificationType;

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
