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

/* COM-008 — log a manual activity. Either accountId OR opportunityId identifies the
   target: when created from an opportunity, accountId is DERIVED from it (never asked
   twice); when created from an account, opportunityId is the optional link. The
   service validates that at least one is present and that a supplied opportunity
   belongs to the account.

   `isSystemGenerated` is intentionally ABSENT — it is never accepted from input; the
   service forces it false (only COM-009 creates system entries). */
export class CreateActivityDto {
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @IsOptional()
  @IsUUID()
  opportunityId?: string;

  @IsEnum(ActivityType)
  type: ActivityType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  detail?: string;

  // WHEN the interaction happened (ISO). Defaults to now in the service when omitted.
  @IsOptional()
  @IsDateString()
  activityDate?: string;
}
