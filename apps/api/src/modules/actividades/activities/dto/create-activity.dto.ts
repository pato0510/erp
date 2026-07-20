import { IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

/* CAL-003 — create a calendar activity. `status` is DELIBERATELY ABSENT: create always forces
 * PENDIENTE in the service (never trust the client for a state-machine value). Dates are
 * strict YYYY-MM-DD strings anchored to UTC in the service (HR-004b); the endDate ≥ startDate
 * and "startTime only single-day" cross-field rules also live in the service. `startTime` is a
 * wall-clock "HH:mm" STRING — validated by regex here, NEVER parsed as a Date anywhere.
 * `assigneeId` is a bare actor UUID (codebase convention; no user-existence lookup). */
export class CreateActivityDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsUUID()
  areaId: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha de inicio debe tener el formato YYYY-MM-DD.',
  })
  startDate: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha de término debe tener el formato YYYY-MM-DD.',
  })
  endDate?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'La hora debe tener el formato HH:mm (24 h).',
  })
  startTime?: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
