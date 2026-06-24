import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/* Body for POST /api/rrhh/document-requirements. Exactly one of employeeId /
   jobPositionId must be set (validated at the service layer + a DB CHECK);
   specificity employee > jobPosition, copy-adapted from the asset>subtype>type
   engine. */
export class CreateEmployeeDocumentRequirementDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsUUID()
  jobPositionId?: string;

  @IsUUID()
  documentTypeId: string;

  @IsOptional()
  @IsBoolean()
  isMandatory?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  appliesToClient?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  appliesToSite?: string;
}
