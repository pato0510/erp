import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Partial update of a CrmOpportunity (demo-simple). Note: stageId is NOT
 * updatable here — stage transitions go through PATCH /:id/move-stage so the
 * simulated Finanzas commitment fields stay consistent.
 */
export class UpdateOpportunityDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsUUID()
  counterpartyId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  probability?: number;

  @IsOptional()
  @IsDateString()
  expectedCloseDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownerName?: string;

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
