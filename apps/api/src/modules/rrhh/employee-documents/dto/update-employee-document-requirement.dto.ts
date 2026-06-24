import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/* Body for PATCH /api/rrhh/document-requirements/:id. If the payload touches a
   target field the service re-validates the single-target invariant against the
   merged set. */
export class UpdateEmployeeDocumentRequirementDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsUUID()
  jobPositionId?: string;

  @IsOptional()
  @IsUUID()
  documentTypeId?: string;

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
