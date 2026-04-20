import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ClosePeriodDto {
  @IsUUID()
  fiscalPeriodId: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ReopenPeriodDto {
  @IsUUID()
  fiscalPeriodId: string;

  @IsString()
  @MaxLength(1000)
  reason: string;
}
