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

/* HSEC-006 — create a training event. `date` is a strict YYYY-MM-DD string anchored to UTC
 * in the service (HR-004b); `time` is a wall-clock "HH:mm" STRING — validated by regex here,
 * NEVER parsed as a Date anywhere (CAL doctrine). instructorName is free text (covers
 * external relators/mutual — employee link is a recorded V2 seed). */
export class CreateTrainingDto {
  @IsEnum(HsecTrainingType, { message: 'El tipo de capacitación no es válido.' })
  type: HsecTrainingType;

  @IsString({ message: 'El tema es obligatorio.' })
  @IsNotEmpty({ message: 'El tema es obligatorio.' })
  @MaxLength(300, { message: 'El tema no puede superar los 300 caracteres.' })
  topic: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe tener el formato YYYY-MM-DD.' })
  date: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'La hora debe tener el formato HH:mm (24 h).',
  })
  time?: string;

  @IsOptional()
  @IsInt({ message: 'La duración debe ser un número entero de minutos.' })
  @Min(1, { message: 'La duración debe ser un número entero positivo.' })
  durationMinutes?: number;

  @IsString({ message: 'El relator es obligatorio.' })
  @IsNotEmpty({ message: 'El relator es obligatorio.' })
  @MaxLength(200, { message: 'El relator no puede superar los 200 caracteres.' })
  instructorName: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Las notas no pueden superar los 2000 caracteres.' })
  notes?: string;

  /* DECOY — whitelisted so the global `forbidNonWhitelisted` pipe doesn't 400 a spoof
   * attempt, but NEVER read: createdBy is ALWAYS the JWT actor (house rule). */
  @IsOptional()
  @IsString()
  createdBy?: string;
}
