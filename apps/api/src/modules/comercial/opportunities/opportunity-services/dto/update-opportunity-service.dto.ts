import { IsNumber, IsOptional, IsPositive, IsString, MaxLength, Min } from 'class-validator';

/* COM-006 — edit a bundle line. quantity / unitPrice / notes are editable; serviceId
   is deliberately NOT (remove the line and add the other service instead), so it is
   not declared here — the ValidationPipe strips it. Any of quantity/unitPrice change
   re-derives the opportunity's estimatedValue in the service. */
export class UpdateOpportunityServiceDto {
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
