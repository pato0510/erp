import { IsUUID } from 'class-validator';

/* HSEC-006 — add one attendee. The id must resolve via the RrhhEmployeeRead leaf
 * (company-scoped, ANY status — a DESVINCULADO attendee is addable: historical
 * registration, the HSEC-003 rationale). */
export class AddAttendeeDto {
  @IsUUID(undefined, { message: 'El empleado debe ser un UUID.' })
  employeeId: string;
}
