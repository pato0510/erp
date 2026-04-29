import {
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

/* OPS-036 — request shape for POST /operations/audit/generate-package.
   `reason` is intentionally required and ≥ 20 chars: an audit
   package without a reason is useless to a future reviewer. */
export class GeneratePackageDto {
  @IsDateString()
  periodFrom!: string;

  @IsDateString()
  periodTo!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  locationIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assetTypeIds?: string[];

  @IsString()
  @MinLength(20)
  @MaxLength(500)
  reason!: string;

  /* Optional — restricts the package to a subset of report codes
     (e.g. ["01","04"]). When omitted all 7 reports are produced. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  includedReports?: string[];
}

export class AuditPackageFiltersDto {
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @IsString()
  generatedBy?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
