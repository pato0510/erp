import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateLeadDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'El nombre debe ser un texto.' })
  @IsNotEmpty({ message: 'El nombre es obligatorio.' })
  @MaxLength(200, { message: 'El nombre no puede superar los 200 caracteres.' })
  name: string;

  @IsUUID('all', { message: 'La cuenta debe ser un UUID válido.' })
  accountId: string;

  @IsOptional()
  @IsUUID('all', { message: 'El contacto debe ser un UUID válido.' })
  contactId?: string | null;

  @IsOptional()
  @IsUUID('all', { message: 'La oportunidad debe ser un UUID válido.' })
  opportunityId?: string;
}
