import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { BillingUnit, ServiceCategory } from '@prisma/client';

/** Partial update of a ServiceCatalog entry (incl. active=false to soft-delete). */
export class UpdateServiceDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsEnum(ServiceCategory)
  category?: ServiceCategory;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  description?: string;

  @IsOptional()
  @IsEnum(BillingUnit)
  billingUnit?: BillingUnit;

  @IsOptional()
  @IsNumber()
  @Min(0)
  basePrice?: number;

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
