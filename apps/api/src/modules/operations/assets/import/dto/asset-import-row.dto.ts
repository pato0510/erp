import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

/* Body for POST /import — only options. The file comes through Multer. */
export class AssetImportOptionsDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  skipDuplicates?: boolean;

  /* Status to assign on creation. The schema only knows AssetStatus values, so
     we accept the same enum here. The wizard exposes this as a "Crear como
     borrador" toggle that maps OUT_OF_SERVICE for now (assets don't have a
     DRAFT lifecycle yet — same simplification as movements where DRAFT is
     just a flag). */
  @IsOptional()
  @IsIn([
    'OPERATIONAL',
    'WITH_OBSERVATIONS',
    'NON_OPERATIONAL',
    'IN_MAINTENANCE',
    'BLOCKED_DOCUMENTAL',
    'BLOCKED_PERMIT',
    'OUT_OF_SERVICE',
    'DECOMMISSIONED',
  ])
  defaultStatus?: string;
}

/* Internal — shape after parsing+validation. Not exposed via decorators since
   it's never the body of an endpoint. */
export interface ParsedAssetRow {
  rowNumber: number;
  code: string;
  name: string;
  description?: string;
  assetTypeId: string;
  assetSubtypeId?: string;
  locationId?: string;
  serialNumber?: string;
  manufacturer?: string;
  model?: string;
  acquisitionDate?: Date;
  acquisitionCost?: number;
  status?: string;
  tags: string[];
  dynamicAttributes: Record<string, string>;
  isDuplicate: boolean;
}

export interface AssetImportRowError {
  field: string;
  message: string;
}

export interface AssetImportPreviewRow {
  rowNumber: number;
  data: {
    code: string;
    name: string;
    assetTypeName?: string;
    subtypeName?: string;
    locationName?: string;
    status?: string;
  };
  errors: AssetImportRowError[];
  isDuplicate: boolean;
  isValid: boolean;
}
