import { IsDateString, IsOptional, IsString } from 'class-validator';

export class UpdateEmployeeDocumentDto {
  @IsOptional()
  @IsString()
  tipoDocumento?: string;

  @IsOptional()
  @IsString()
  nombre?: string;

  @IsOptional()
  @IsDateString()
  fechaEmision?: string;

  @IsOptional()
  @IsDateString()
  fechaVencimiento?: string;

  @IsOptional()
  @IsString()
  fileName?: string;

  @IsOptional()
  @IsString()
  mimeType?: string;
}
