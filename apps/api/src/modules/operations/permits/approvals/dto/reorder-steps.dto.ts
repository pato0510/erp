import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsOptional, IsUUID, ValidateNested } from 'class-validator';

export class ReorderStepEntryDto {
  @IsUUID()
  id: string;

  @Type(() => Number)
  stepOrder: number;
}

export class ReorderStepsDto {
  @IsOptional()
  @IsUUID()
  workPermitTypeId?: string;

  @IsOptional()
  @IsUUID()
  permitTypeId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderStepEntryDto)
  steps: ReorderStepEntryDto[];
}

export class ApplyDefaultsDto {
  @IsEnum(['work-permits', 'external-permits', 'both'])
  mode: 'work-permits' | 'external-permits' | 'both';
}
