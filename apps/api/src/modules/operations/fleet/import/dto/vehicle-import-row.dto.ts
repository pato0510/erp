import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { AssetStatus, FuelType } from '@prisma/client';

/* Body for POST /import — only options. The file comes through Multer. */
export class VehicleImportOptionsDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  skipDuplicates?: boolean;

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

/* Internal — shape after parsing+validation. Each row maps to one
   OperationalAsset + Vehicle pair created in a single transaction. */
export interface ParsedVehicleRow {
  rowNumber: number;
  /* Asset fields */
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
  status?: AssetStatus;
  tags: string[];
  /* Vehicle fields */
  licensePlate: string;
  vin?: string;
  year?: number;
  currentKilometers?: number;
  fuelType: FuelType;
  registrationDate?: Date;
  color?: string;
  /* True when the asset code already exists in DB. Treated separately from
     plate duplicates because the upsert key is the asset code. */
  isDuplicate: boolean;
}

export interface VehicleImportRowError {
  field: string;
  message: string;
}

export interface VehicleImportPreviewRow {
  rowNumber: number;
  data: {
    code: string;
    name: string;
    licensePlate: string;
    assetTypeName?: string;
    subtypeName?: string;
    locationName?: string;
    fuelType?: string;
    status?: string;
  };
  errors: VehicleImportRowError[];
  isDuplicate: boolean;
  isValid: boolean;
}
