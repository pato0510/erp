import { ActivityType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/* COM-008 — edit a manual activity. Editable: type, subject, detail, activityDate,
   opportunityId (revalidated against the activity's account). `accountId` is NOT
   editable (an activity's account is fixed — the FK CASCADE anchor). `opportunityId`
   accepts null to UNLINK (IsOptional lets null through; the service treats
   `undefined` = leave as-is, `null` = unlink, a UUID = relink). `isSystemGenerated`
   is absent and never writable; the service refuses to update a system row at all. */
export class UpdateActivityDto {
  @IsOptional()
  @IsEnum(ActivityType)
  type?: ActivityType;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  detail?: string;

  @IsOptional()
  @IsDateString()
  activityDate?: string;

  @IsOptional()
  @IsUUID()
  opportunityId?: string | null;
}
