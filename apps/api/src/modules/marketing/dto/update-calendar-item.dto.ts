import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { CalendarItemStatus, CalendarItemType } from '@prisma/client';

/** Partial update of a CalendarItem (demo-simple). */
export class UpdateCalendarItemDto {
  @IsOptional()
  @IsEnum(CalendarItemType)
  type?: CalendarItemType;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  channel?: string;

  @IsOptional()
  @IsEnum(CalendarItemStatus)
  status?: CalendarItemStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownerName?: string;

  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  serviceName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  targetSegment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  zone?: string;

  @IsOptional()
  @IsUUID()
  campaignId?: string | null;
}
