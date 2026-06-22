import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CalculatePayrollDto {
  @IsNumber()
  @Min(0)
  sueldoBruto: number;

  @IsOptional()
  @IsString()
  afp?: string;

  @IsOptional()
  @IsString()
  salud?: string;
}
