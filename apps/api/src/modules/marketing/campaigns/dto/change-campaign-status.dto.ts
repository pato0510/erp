import { CampaignStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

/* MKT-002 — the canonical status-change payload. `status` is the TARGET state; the
   service enforces the transition machine (free among BORRADOR/ACTIVA/PAUSADA;
   ACTIVA/PAUSADA → FINALIZADA/CANCELADA; FINALIZADA/CANCELADA → ACTIVA reopen; any
   move INTO ACTIVA requires startDate). Everything else — including same-status
   no-ops — is rejected. */
export class ChangeCampaignStatusDto {
  @IsEnum(CampaignStatus)
  status: CampaignStatus;
}
