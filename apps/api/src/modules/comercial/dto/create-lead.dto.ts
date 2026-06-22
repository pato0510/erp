import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { CrmLeadPriority, CrmLeadSource, CrmLeadStatus } from '@prisma/client';

/**
 * Creates a CrmLead (top of funnel). `company` is the prospect's company name
 * (free text — NOT a Finance Counterparty). sourceCampaignId optionally links to
 * a Marketing MarketingCampaign (plain column). status defaults to NUEVO and
 * priority to MEDIA at the column level.
 */
export class CreateLeadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  contactName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  company: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  position?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  serviceInterest?: string;

  @IsEnum(CrmLeadSource)
  source: CrmLeadSource;

  @IsOptional()
  @IsUUID()
  sourceCampaignId?: string;

  @IsOptional()
  @IsEnum(CrmLeadStatus)
  status?: CrmLeadStatus;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  ownerName: string;

  @IsOptional()
  @IsEnum(CrmLeadPriority)
  priority?: CrmLeadPriority;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  discardReason?: string;

  @IsOptional()
  @IsDateString()
  createdDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  nextAction?: string;
}
