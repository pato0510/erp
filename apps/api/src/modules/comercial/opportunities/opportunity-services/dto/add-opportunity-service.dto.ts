import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

/* COM-006 — add a catalog service to an opportunity's bundle. `unitPrice` is
   OPTIONAL: when omitted it is SNAPSHOTTED from the catalog's current basePrice at
   add time; when provided it overrides (negotiated per deal). `quantity` is required
   and must be strictly > 0 (fractional is real, e.g. 2.5 months). `serviceId` is
   validated company-scoped + isActive in the service. */
export class AddOpportunityServiceDto {
  @IsUUID()
  serviceId: string;

  // Fractional quantities are real (e.g. 2.5 months). Strictly > 0.
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  quantity: number;

  // CLP money — optional price override; snapshotted from basePrice when omitted. ≥ 0.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
