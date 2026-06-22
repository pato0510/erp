import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { CampaignTaskType } from '@prisma/client';

/** Partial update of a CampaignTask (toggle done, edit fields). */
export class UpdateCampaignTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsEnum(CampaignTaskType)
  type?: CampaignTaskType;

  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @IsOptional()
  @IsBoolean()
  done?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownerName?: string;
}
