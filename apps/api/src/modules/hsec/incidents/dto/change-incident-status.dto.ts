import { HsecIncidentStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

/* HSEC-002 — the canonical machine endpoint's body (COM-005 convention). */
export class ChangeIncidentStatusDto {
  @IsEnum(HsecIncidentStatus, { message: 'El estado no es válido.' })
  status: HsecIncidentStatus;
}
