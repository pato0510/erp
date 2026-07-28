import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class CreateEppDeliveryLineDto {
  @IsUUID(undefined, { message: 'El elemento debe ser un UUID.' })
  eppItemId: string;

  /* The positive-int rule (>0) is enforced in the SERVICE, not here: the platform exception
     filter surfaces only service-thrown message strings — a class-validator constraint array
     collapses to a generic "Bad Request Exception" body, and the founder-facing 400 must be
     verbatim Spanish. IsInt stays as the type floor. */
  @IsInt({ message: 'La cantidad debe ser un número entero positivo.' })
  quantity: number;

  @IsOptional()
  @IsString()
  @MaxLength(40, { message: 'La talla no puede superar los 40 caracteres.' })
  size?: string;
}

/* HSEC-008 — create a delivery: header + lines in ONE transaction. employeeId must resolve
 * via the RrhhEmployeeRead leaf (400 otherwise); every item must exist in the company AND be
 * active (NEW deliveries never accept inactive items; historical ones keep them via the DB
 * Restrict). */
export class CreateEppDeliveryDto {
  @IsUUID(undefined, { message: 'El empleado debe ser un UUID.' })
  employeeId: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe tener el formato YYYY-MM-DD.' })
  date: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Las notas no pueden superar los 2000 caracteres.' })
  notes?: string;

  /* The at-least-one-line rule lives in the SERVICE (same verbatim-message rationale as
     quantity above). */
  @IsArray({ message: 'La entrega debe incluir al menos un elemento.' })
  @ValidateNested({ each: true })
  @Type(() => CreateEppDeliveryLineDto)
  lines: CreateEppDeliveryLineDto[];

  /* DECOY — whitelisted so the global `forbidNonWhitelisted` pipe doesn't 400 a spoof
   * attempt, but NEVER read: createdBy is ALWAYS the JWT actor (house rule). */
  @IsOptional()
  @IsString()
  createdBy?: string;
}
