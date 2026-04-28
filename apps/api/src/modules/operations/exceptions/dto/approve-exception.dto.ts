import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

export class ApproveExceptionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  approvedReason?: string;

  @IsOptional()
  @IsISO8601()
  validFrom?: string;

  @IsISO8601()
  validUntil: string;
}
