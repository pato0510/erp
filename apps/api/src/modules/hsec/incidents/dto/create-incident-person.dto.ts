import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

/* HSEC-003 — add an afectado to an incident. `employeeId` must resolve via the
 * RrhhEmployeeRead leaf (company-scoped, ANY status — a DESVINCULADO employee IS addable:
 * historical incidents get registered late, and the person affected back then may no longer
 * be with the company). Injury fields cover the DIAT core (PART1 decision 10). */
export class CreateIncidentPersonDto {
  @IsUUID(undefined, { message: 'El empleado debe ser un UUID.' })
  employeeId: string;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'El tipo de lesión no puede superar los 200 caracteres.' })
  injuryType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'La parte del cuerpo no puede superar los 200 caracteres.' })
  bodyPart?: string;

  @IsOptional()
  @IsBoolean({ message: 'La atención médica debe ser verdadero o falso.' })
  medicalAttention?: boolean;

  @IsOptional()
  @IsInt({ message: 'Los días perdidos deben ser un número entero.' })
  @Min(0, { message: 'Los días perdidos no pueden ser negativos.' })
  lostDays?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'El detalle no puede superar los 2000 caracteres.' })
  detail?: string;
}
