import { IsNumber, IsOptional, IsPositive, IsString, MaxLength, Min } from 'class-validator';

/* COM-010 — edit a BORRADOR quote line: quantity / unitPrice / notes. serviceId (and
   its serviceName snapshot) is NOT editable — remove the line and add another service
   instead (same precedent as the bundle). */
export class UpdateQuoteLineDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  quantity?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
