import { IsDateString, IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

export class CreateFiscalPeriodDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsInt()
  @Min(2020)
  year: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;
}
