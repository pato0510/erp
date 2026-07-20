import { ActivityStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

/* CAL-003 — the ONLY channel for a status move (PATCH /:id/status). The service enforces the
 * allowed edges (PENDIENTE↔HECHA, PENDIENTE↔CANCELADA); HECHA↔CANCELADA and same-status are
 * rejected per the COM-005 convention. */
export class ChangeStatusDto {
  @IsEnum(ActivityStatus)
  status: ActivityStatus;
}
