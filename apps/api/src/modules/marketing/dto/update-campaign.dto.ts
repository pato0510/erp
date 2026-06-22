import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { CampaignStatus } from '@prisma/client';

/** Partial update of a MarketingCampaign (demo-simple). */
export class UpdateCampaignDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  channel?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;

  @IsOptional()
  @IsEnum(CampaignStatus)
  status?: CampaignStatus;

  /* ── Commercial brief (calendar upgrade) — all optional ── */

  @IsOptional()
  @IsString()
  @MaxLength(400)
  objective?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  serviceAssociated?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  targetSegment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  zone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  ctaType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  kpiTarget?: string;
}
