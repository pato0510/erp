import { IsNumber, IsUUID } from 'class-validator';

export class SetOpeningBalanceDto {
  @IsUUID()
  bankAccountId: string;

  @IsUUID()
  fiscalPeriodId: string;

  @IsNumber()
  openingBalance: number;
}
