import {
  IsArray,
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { AssetStatus } from '@prisma/client';

export class CreateAssetDto {
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
}
