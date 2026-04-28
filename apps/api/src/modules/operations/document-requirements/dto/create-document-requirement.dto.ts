import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateDocumentRequirementDto {
  @IsUUID()
  documentTypeId: string;

  /* Exactly one of these three target fields must be set. Enforced at the
     service layer + a CHECK constraint at the DB level. */
  @IsOptional()
  @IsUUID()
  assetTypeId?: string;

  @IsOptional()
  @IsUUID()
  assetSubtypeId?: string;

  @IsOptional()
  @IsUUID()
  assetId?: string;

  @IsOptional()
  @IsBoolean()
  isMandatory?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}
