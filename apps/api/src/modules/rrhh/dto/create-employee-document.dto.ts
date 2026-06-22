import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * THIN document metadata — no real file storage in the demo. `estado` is derived
 * from dates in the service layer, so it is intentionally not accepted here.
 */
export class CreateEmployeeDocumentDto {
  @IsString()
  @IsNotEmpty()
  tipoDocumento: string;

  @IsString()
  @IsNotEmpty()
  nombre: string;

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
