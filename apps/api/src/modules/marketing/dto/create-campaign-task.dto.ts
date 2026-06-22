import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { CampaignTaskType } from '@prisma/client';

/** Creates a CampaignTask under a campaign (campaignId required). */
export class CreateCampaignTaskDto {
  @IsUUID()
  campaignId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsEnum(CampaignTaskType)
  type: CampaignTaskType;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsBoolean()
  done?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownerName?: string;
}
