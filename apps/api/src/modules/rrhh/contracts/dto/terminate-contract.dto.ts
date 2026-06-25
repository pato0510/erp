import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

/* Body for POST /api/rrhh/contracts/:id/terminate. Reason + date are optional;
   the service records them in the contract notes (no dedicated columns) and
   flips status to TERMINADO. */
export class TerminateContractDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;

  @IsOptional()
  @IsISO8601()
  date?: string;
}
