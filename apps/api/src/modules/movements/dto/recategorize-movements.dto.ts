import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class RecategorizeMovementsDto {
  @IsBoolean()
  dryRun = true;

  @IsOptional()
  @IsUUID()
  fiscalPeriodId?: string;
}
