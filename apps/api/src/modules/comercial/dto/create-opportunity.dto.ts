import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
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
 * Creates a CrmOpportunity. counterpartyId references a Finance Counterparty
 * (a CLIENT) — plain column, validated as a UUID only. sourceCampaignId
 * optionally references a Marketing MarketingCampaign (lead source).
 * generatedCommitment* fields are NOT accepted here — they are set/cleared by
 * the move-stage flow (simulated Finanzas link).
 */
export class CreateOpportunityDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsUUID()
  counterpartyId: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsInt()
  @Min(0)
  @Max(100)
  probability: number;

  @IsOptional()
  @IsDateString()
  expectedCloseDate?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  ownerName: string;

  @IsUUID()
  stageId: string;

  @IsOptional()
  @IsUUID()
  sourceCampaignId?: string;

  /* ── Drone / industrial commercial detail (all optional) ── */

  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  needDetected?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  serviceZone?: string;

  @IsOptional()
  @IsBoolean()
  requiresVisit?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresDrone?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresCertifiedStaff?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  lossReason?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];
}
