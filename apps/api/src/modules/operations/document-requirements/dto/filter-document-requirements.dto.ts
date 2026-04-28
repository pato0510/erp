import { IsOptional, IsUUID } from 'class-validator';

export class FilterDocumentRequirementsDto {
  @IsOptional()
  @IsUUID()
  documentTypeId?: string;

  @IsOptional()
  @IsUUID()
  assetTypeId?: string;

  @IsOptional()
  @IsUUID()
  assetSubtypeId?: string;

  @IsOptional()
  @IsUUID()
  assetId?: string;
}
