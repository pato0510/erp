import { IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/* Body for POST /api/rrhh/certifications. category + expiry default from the
   type; expiry also auto-derives from defaultValidityDays when the type
   requiresExpiry (copy of the HR-004 derivation). The certificate PDF is an
   optional link to an existing EmployeeDocument (not re-uploaded here). */
export class CreateCertificationDto {
  @IsUUID()
  employeeId: string;

  @IsUUID()
  certificationTypeId: string;

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
}
