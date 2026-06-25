import { IsEnum } from 'class-validator';
import { SettlementStatus } from '@prisma/client';

/* Body for POST /api/rrhh/settlements/:id/status. */
export class SettlementStatusDto {
  @IsEnum(SettlementStatus)
  status: SettlementStatus;
}
