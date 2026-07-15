import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/* CAL-002 — create an activity area (a configurable planning lane). `name` is required and
   unique per company (the DB UNIQUE + a P2002→409 in the service). `color` is optional; when
   present it must be a "#RRGGBB" hex (the UI offers a fixed palette). createdBy comes from
   the JWT actor in the service. */
export class CreateAreaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'El color debe ser un hex "#RRGGBB".',
  })
  color?: string;
}
