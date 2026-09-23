import { CommercialActivityStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateActivityStatusDto {
  @IsEnum(CommercialActivityStatus)
  status: CommercialActivityStatus;
}
