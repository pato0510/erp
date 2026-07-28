import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/* HSEC-003 — edit an afectado's injury fields. `employeeId` is DELIBERATELY ABSENT: the
 * person a row refers to is its identity (the unique pair) — swapping the person is a
 * delete + add, never an edit. */
export class UpdateIncidentPersonDto {
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'El tipo de lesión no puede superar los 200 caracteres.' })
  injuryType?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'La parte del cuerpo no puede superar los 200 caracteres.' })
  bodyPart?: string | null;

  @IsOptional()
  @IsBoolean({ message: 'La atención médica debe ser verdadero o falso.' })
  medicalAttention?: boolean;

  @IsOptional()
  @IsInt({ message: 'Los días perdidos deben ser un número entero.' })
  @Min(0, { message: 'Los días perdidos no pueden ser negativos.' })
  lostDays?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'El detalle no puede superar los 2000 caracteres.' })
  detail?: string | null;
}
