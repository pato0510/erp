import { IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { CampaignStatus } from '@prisma/client';

/** Creates a MarketingCampaign. cost is the planned budget (CLP). */
export class CreateCampaignDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  channel: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsNumber()
  @Min(0)
  cost: number;

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
