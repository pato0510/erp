import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { CrmLeadPriority, CrmLeadSource, CrmLeadStatus } from '@prisma/client';

/** Partial update of a CrmLead (e.g. advance status, set discardReason). */
export class UpdateLeadDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  contactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string;

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

  @IsOptional()
  @IsEnum(CrmLeadSource)
  source?: CrmLeadSource;

  @IsOptional()
  @IsUUID()
  sourceCampaignId?: string;

  @IsOptional()
  @IsEnum(CrmLeadStatus)
  status?: CrmLeadStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownerName?: string;

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
