import { IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

/**
 * Converts a CrmLead into a CrmOpportunity. counterpartyId (the Finance CLIENT
 * the opportunity is filed against) is required. serviceId / amount / ownerName /
 * stageId are optional — sensible defaults are applied server-side (stageId →
 * first stage by order, amount → 0, ownerName → lead.ownerName). On success the
 * lead's status is set to CONVERTIDO.
 */
export class ConvertLeadDto {
  @IsUUID()
  counterpartyId: string;

  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownerName?: string;

  @IsOptional()
  @IsUUID()
  stageId?: string;
}
