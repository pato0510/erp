import { HsecTrainingType } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

/* HSEC-006 — general-field edit, allowed always (PART1 decision 6: free edit; the platform
 * audit trigger is the forensic layer). The planilla file is NOT edited here — it has its
 * own /:id/file endpoints. */
export class UpdateTrainingDto {
  @IsOptional()
  @IsEnum(HsecTrainingType, { message: 'El tipo de capacitación no es válido.' })
  type?: HsecTrainingType;

  @IsOptional()
  @IsString({ message: 'El tema es obligatorio.' })
  @IsNotEmpty({ message: 'El tema es obligatorio.' })
  @MaxLength(300, { message: 'El tema no puede superar los 300 caracteres.' })
  topic?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe tener el formato YYYY-MM-DD.' })
  date?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'La hora debe tener el formato HH:mm (24 h).',
  })
  time?: string | null;

  @IsOptional()
  @IsInt({ message: 'La duración debe ser un número entero de minutos.' })
  @Min(1, { message: 'La duración debe ser un número entero positivo.' })
  durationMinutes?: number | null;

  @IsOptional()
  @IsString({ message: 'El relator es obligatorio.' })
  @IsNotEmpty({ message: 'El relator es obligatorio.' })
  @MaxLength(200, { message: 'El relator no puede superar los 200 caracteres.' })
  instructorName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Las notas no pueden superar los 2000 caracteres.' })
  notes?: string | null;
}
