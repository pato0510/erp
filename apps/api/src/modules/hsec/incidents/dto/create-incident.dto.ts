import { HsecIncidentSeverity, HsecIncidentType } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

/* HSEC-002 — create an incident. `status` is DELIBERATELY ABSENT: create always forces
 * REPORTADO in the service (never trust the client for a state-machine value).
 * `incidentNumber` is likewise absent — minted server-side inside the create transaction.
 * occurredDate is a strict YYYY-MM-DD string anchored to UTC in the service (HR-004b);
 * occurredTime is a wall-clock "HH:mm" STRING — validated by regex here, NEVER parsed as a
 * Date anywhere (CAL doctrine). `sourceWorkPermitId` is a bare soft pointer accepted from
 * day one (the assigneeId precedent — no picker in V1, PART1 decision 8). */
export class CreateIncidentDto {
  @IsEnum(HsecIncidentType, { message: 'El tipo de incidente no es válido.' })
  type: HsecIncidentType;

  @IsEnum(HsecIncidentSeverity, { message: 'La severidad no es válida.' })
  severity: HsecIncidentSeverity;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha de ocurrencia debe tener el formato YYYY-MM-DD.',
  })
  occurredDate: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'La hora debe tener el formato HH:mm (24 h).',
  })
  occurredTime?: string;

  @IsString({ message: 'El lugar es obligatorio.' })
  @IsNotEmpty({ message: 'El lugar es obligatorio.' })
  @MaxLength(300, { message: 'El lugar no puede superar los 300 caracteres.' })
  location: string;

  @IsString({ message: 'La descripción es obligatoria.' })
  @IsNotEmpty({ message: 'La descripción es obligatoria.' })
  @MaxLength(5000, { message: 'La descripción no puede superar los 5000 caracteres.' })
  description: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'La causa inmediata no puede superar los 2000 caracteres.' })
  immediateCause?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Las acciones correctivas no pueden superar los 2000 caracteres.' })
  correctiveActions?: string;

  @IsOptional()
  @IsUUID(undefined, { message: 'El permiso de trabajo de origen debe ser un UUID.' })
  sourceWorkPermitId?: string;

  /* DECOY — whitelisted so the global `forbidNonWhitelisted` pipe doesn't 400 a spoof
   * attempt, but NEVER read by the service: createdBy is ALWAYS the JWT actor (house
   * rule). Kept optional and untyped-loose on purpose. */
  @IsOptional()
  @IsString()
  createdBy?: string;
}
