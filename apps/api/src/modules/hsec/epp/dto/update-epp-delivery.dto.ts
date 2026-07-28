import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';
import { CreateEppDeliveryLineDto } from './create-epp-delivery.dto';

/* HSEC-008 — edit a delivery. `employeeId` is DELIBERATELY ABSENT — IMMUTABLE (the
 * pair-identity ruling: the person a delivery was handed to is its identity; wrong person =
 * delete + recreate, never an edit). Optional `lines` REPLACES the full set transactionally
 * (delete + recreate inside one transaction; the audit trigger keeps the old lines). */
export class UpdateEppDeliveryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe tener el formato YYYY-MM-DD.' })
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Las notas no pueden superar los 2000 caracteres.' })
  notes?: string | null;

  /* min-1 + positive-quantity live in the SERVICE (verbatim-message rationale — see the
     create DTO). */
  @IsOptional()
  @IsArray({ message: 'La entrega debe incluir al menos un elemento.' })
  @ValidateNested({ each: true })
  @Type(() => CreateEppDeliveryLineDto)
  lines?: CreateEppDeliveryLineDto[];
}
