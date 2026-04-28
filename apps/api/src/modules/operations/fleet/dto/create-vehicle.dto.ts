import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { FuelType } from '@prisma/client';

export class CreateVehicleDto {
  @IsUUID()
  assetId: string;

  @IsString()
  @IsNotEmpty()
  licensePlate: string;

  @IsOptional()
  @IsString()
  vin?: string;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
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
  color?: string;
}
