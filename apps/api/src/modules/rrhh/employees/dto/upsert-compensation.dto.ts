import { HealthSystem } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpsertCompensationDto {
  @IsNumber()
  @Min(0)
  baseSalaryGross: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  afp?: string;

  @IsOptional()
  @IsEnum(HealthSystem)
  health?: HealthSystem;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  bank?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  bankAccountType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  bankAccount?: string;
}
