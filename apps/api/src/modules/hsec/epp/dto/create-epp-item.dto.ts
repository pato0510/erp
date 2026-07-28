import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/* HSEC-008 — create a catalog item. Duplicate name → DB unique backstop → P2002 → 409. */
export class CreateEppItemDto {
  @IsString({ message: 'El nombre es obligatorio.' })
  @IsNotEmpty({ message: 'El nombre es obligatorio.' })
  @MaxLength(120, { message: 'El nombre no puede superar los 120 caracteres.' })
  name: string;
}
