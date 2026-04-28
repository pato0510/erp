import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class ApproveStepDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  stepOrder: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class RejectStepDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  stepOrder: number;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  notes: string;
}

export class SkipStepDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  stepOrder: number;

  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  reason: string;
}

export class FilterPendingApprovalsDto {
  @IsOptional()
  @IsString()
  source?: 'work-permit' | 'external-permit' | 'all';
}
