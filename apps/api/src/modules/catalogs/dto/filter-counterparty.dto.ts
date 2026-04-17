import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { CounterpartyType } from '@prisma/client';
import { Transform } from 'class-transformer';

export class FilterCounterpartyDto {
  @IsOptional()
  @IsEnum(CounterpartyType)
  type?: CounterpartyType;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  isActive?: boolean;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
