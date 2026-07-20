import { PartialType } from '@nestjs/mapped-types';
import { CreateActivityDto } from './create-activity.dto';

/* CAL-003 — PATCH /:id. Every field optional; the same validators (date format, HH:mm,
 * UUIDs) apply when a field is present. `status` is inherited-absent from CreateActivityDto —
 * status moves go ONLY through PATCH /:id/status, never through a general field edit. Editing
 * is allowed in ANY status (this is a planning tool, not a ledger — see the service header). */
export class UpdateActivityDto extends PartialType(CreateActivityDto) {}
