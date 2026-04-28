import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class AuthorizeWorkPermitDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  authorizationNotes?: string;
}

export class RejectWorkPermitDto {
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  reason: string;
}

export class SuspendWorkPermitDto {
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  reason: string;
}

export class CloseWorkPermitDto {
  @IsString()
  @MinLength(5)
  @MaxLength(4000)
  closureNotes: string;

  @IsBoolean()
  incidentsReported: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  incidentDescription?: string;
}

export class CancelWorkPermitDto {
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  reason: string;
}

export class GasMeasurementDto {
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  gas: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  value: number;

  @IsString()
  @MinLength(1)
  @MaxLength(10)
  unit: string;

  @IsISO8601()
  measuredAt: string;
}
