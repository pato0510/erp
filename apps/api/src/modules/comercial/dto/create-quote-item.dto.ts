import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Adds a line item to a CrmQuote. serviceId optionally references a
 * ServiceCatalog entry (free-form lines allowed). lineTotal is computed
 * server-side = quantity * unitPrice * (1 - discountPct/100); after insert the
 * quote's subtotal / ivaAmount / total are recalculated.
 */
export class CreateQuoteItemDto {
  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  description: string;

  @IsNumber()
  @Min(0)
  quantity: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  unit: string;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPct?: number;
}
