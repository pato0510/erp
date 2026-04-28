import {
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { AssetStatus, FuelType } from '@prisma/client';

const MAX_YEAR = new Date().getUTCFullYear() + 1;

export class CreateVehicleDto {
  /* Asset fields */

  @IsUUID()
  assetTypeId: string;

  @IsOptional()
  @IsUUID()
  assetSubtypeId?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsUUID()
  parentAssetId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  serialNumber?: string;

  @IsOptional()
  @IsString()
  manufacturer?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsISO8601()
  acquisitionDate?: string;

  @IsOptional()
  @IsNumber()
  acquisitionCost?: number;

  @IsOptional()
  @IsEnum(AssetStatus)
  status?: AssetStatus;

  @IsOptional()
  @IsString()
  statusReason?: string;

  @IsOptional()
  @IsObject()
  dynamicAttributes?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsUUID()
  assignedToUserId?: string;

  /* Vehicle-specific fields */

  /* Auto-uppercased and trimmed before validation. We accept any combination of
     uppercase alphanumeric chars with optional hyphens (covers Chilean formats
     like AA-AA-12 and AA-12-34 plus older patterns and foreign plates). */
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z0-9-]+$/, {
    message: 'La patente debe contener solo letras, números y guiones.',
  })
  licensePlate: string;

  @IsOptional()
  @IsString()
  @MaxLength(17)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() || undefined : value,
  )
  vin?: string;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(MAX_YEAR)
  year?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  currentKilometers?: number;

  @IsEnum(FuelType)
  fuelType: FuelType;

  @IsOptional()
  @IsISO8601()
  registrationDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  color?: string;
}
