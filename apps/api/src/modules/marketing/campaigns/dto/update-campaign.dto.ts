import { PartialType } from '@nestjs/mapped-types';
import { CreateCampaignDto } from './create-campaign.dto';

/* MKT-002 — all editable fields optional (name, channel, description, startDate,
   endDate, budgetAmount, ownerId, notes). `status` is intentionally ABSENT: it is
   NOT editable here — status moves only through PATCH /:id/status so the transition
   machine is the single source of truth. Editing a FINALIZADA/CANCELADA campaign is
   rejected by the service (closed-state guard); reopen via the status endpoint first.
   To clear an optional field send it as null (passes @IsOptional; the service nulls
   the column). */
export class UpdateCampaignDto extends PartialType(CreateCampaignDto) {}
