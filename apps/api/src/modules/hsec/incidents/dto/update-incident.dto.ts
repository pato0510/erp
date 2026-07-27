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

/* HSEC-002 — general-field edit, allowed in ANY status (PART1 decision 6: free edit; the
 * platform audit trigger is the forensic layer). `status` is declared ONLY as a decoy so the
 * service can reject it with the verbatim Spanish 400 (the ServiceOrder update precedent) —
 * status moves go exclusively through PATCH /:id/status. */
export class UpdateIncidentDto {
  @IsOptional()
  @IsEnum(HsecIncidentType, { message: 'El tipo de incidente no es válido.' })
  type?: HsecIncidentType;

  @IsOptional()
  @IsEnum(HsecIncidentSeverity, { message: 'La severidad no es válida.' })
  severity?: HsecIncidentSeverity;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha de ocurrencia debe tener el formato YYYY-MM-DD.',
  })
  occurredDate?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'La hora debe tener el formato HH:mm (24 h).',
  })
  occurredTime?: string | null;

  @IsOptional()
  @IsString({ message: 'El lugar es obligatorio.' })
  @IsNotEmpty({ message: 'El lugar es obligatorio.' })
  @MaxLength(300, { message: 'El lugar no puede superar los 300 caracteres.' })
  location?: string;

  @IsOptional()
  @IsString({ message: 'La descripción es obligatoria.' })
  @IsNotEmpty({ message: 'La descripción es obligatoria.' })
  @MaxLength(5000, { message: 'La descripción no puede superar los 5000 caracteres.' })
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'La causa inmediata no puede superar los 2000 caracteres.' })
  immediateCause?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Las acciones correctivas no pueden superar los 2000 caracteres.' })
  correctiveActions?: string | null;

  @IsOptional()
  @IsUUID(undefined, { message: 'El permiso de trabajo de origen debe ser un UUID.' })
  sourceWorkPermitId?: string | null;

  /* DECOY — declared so the pipe lets it through for the service to reject with the
   * verbatim Spanish message (status is NOT editable via general edit). */
  @IsOptional()
  @IsString()
  status?: string;
}
