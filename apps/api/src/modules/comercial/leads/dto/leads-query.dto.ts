import { IsOptional, IsString, IsUUID } from 'class-validator';

export class LeadsQueryDto {
  @IsOptional()
  @IsUUID('all', { message: 'La cuenta debe ser un UUID válido.' })
  accountId?: string;

  @IsOptional()
  @IsString({ message: 'La búsqueda debe ser un texto.' })
  q?: string;
}
