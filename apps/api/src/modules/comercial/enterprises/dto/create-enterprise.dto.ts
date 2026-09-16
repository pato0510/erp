import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/* COM-018 — create the client's parent company (Enterprise ≠ Company, the tenant).
   `name` is trimmed and re-checked (1..200) in the service; `rut` is optional and, when
   present, normalized with the shared RUT helpers and Módulo-11 validated (400 on a bad
   check digit). Uniqueness (name case-insensitive, rut) is enforced by the service
   pre-check + the migration's unique indexes (409). `createdBy` is intentionally ABSENT —
   it comes from the JWT. */
export class CreateEnterpriseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  rut?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  industry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
