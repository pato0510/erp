import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { CalendarItemStatus, CalendarItemType } from '@prisma/client';

/**
 * Creates a CalendarItem (the multi-type marketing board entry). campaignId is
 * optional — standalone items are allowed. serviceId/serviceName are display
 * references to a Comercial ServiceCatalog row (never a FK / write into CRM).
 */
export class CreateCalendarItemDto {
  @IsEnum(CalendarItemType)
  type: CalendarItemType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

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
  campaignId?: string;
}
