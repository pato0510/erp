import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { CommitmentStatus, MovementType } from '@prisma/client';
import { Transform } from 'class-transformer';

export class FilterCommitmentDto {
  @IsOptional()
  @IsEnum(CommitmentStatus)
  status?: CommitmentStatus;

  @IsOptional()
  @IsEnum(MovementType)
  type?: MovementType;

  @IsOptional()
  @IsString()
  dueDateFrom?: string;

  @IsOptional()
  @IsString()
  dueDateTo?: string;

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
