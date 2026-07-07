import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

/* COM-010 — add a line to a BORRADOR quote. Like the bundle: pick an ACTIVE catalog
   service; unitPrice is OPTIONAL (snapshotted from the service's basePrice when
   omitted; the serviceName snapshot is taken server-side). quantity must be > 0. */
export class AddQuoteLineDto {
  @IsUUID()
  serviceId: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  quantity: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
