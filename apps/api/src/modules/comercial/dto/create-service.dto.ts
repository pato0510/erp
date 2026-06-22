import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { BillingUnit, ServiceCategory } from '@prisma/client';

/** Creates a ServiceCatalog entry (a B2B drone / industrial service). */
export class CreateServiceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name: string;

  @IsEnum(ServiceCategory)
  category: ServiceCategory;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  description?: string;

  @IsEnum(BillingUnit)
  billingUnit: BillingUnit;

  @IsNumber()
  @Min(0)
  basePrice: number;

  @IsOptional()
  @IsBoolean()
  requiresEquipment?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresCertifiedStaff?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
