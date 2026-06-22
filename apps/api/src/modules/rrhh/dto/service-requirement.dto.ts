import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { CertificationType } from '@prisma/client';

/**
 * A ServiceRequirement maps a Comercial ServiceCatalog name (string-matched, NO
 * FK) to the certification it requires. `requiredCertType` null = no specific
 * cert required for that service.
 */
export class CreateServiceRequirementDto {
  @IsString()
  @IsNotEmpty()
  serviceName: string;

  @IsOptional()
  @IsEnum(CertificationType)
  requiredCertType?: CertificationType;

  @IsOptional()
  @IsBoolean()
  requiresDrone?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateServiceRequirementDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  serviceName?: string;

  @IsOptional()
  @IsEnum(CertificationType)
  requiredCertType?: CertificationType;

  @IsOptional()
  @IsBoolean()
  requiresDrone?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}
