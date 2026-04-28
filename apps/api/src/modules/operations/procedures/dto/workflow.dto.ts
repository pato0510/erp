import { IsBoolean, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ReviewProcedureDto {
  @IsBoolean()
  approved: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class PublishProcedureDto {
  @IsOptional()
  @IsISO8601()
  effectiveDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class DeprecateProcedureDto {
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  reason: string;
}

export class AddAttachmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
