import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { AlertSeverity, NotificationSourceType } from '@prisma/client';

/* Generic create payload — used by `createGeneric` to broadcast a
   notification to a specific list of users. The alert/asset-specific
   factories build their own data shapes internally. */
export class CreateNotificationDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  userIds: string[];

  @IsEnum(NotificationSourceType)
  sourceType: NotificationSourceType;

  @IsString()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;

  @IsEnum(AlertSeverity)
  severity: AlertSeverity;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  linkPath?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  icon?: string;
}
