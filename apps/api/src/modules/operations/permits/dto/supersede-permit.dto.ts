import { IsEnum, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { PermitStatus } from '@prisma/client';

export class SupersedePermitDto {
  @IsString()
  @MaxLength(120)
  permitNumber: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  issuingAuthority?: string;

  @IsOptional()
  @IsISO8601()
  issueDate?: string;

  @IsOptional()
  @IsISO8601()
  expirationDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  scope?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsEnum(PermitStatus)
  setStatus?: PermitStatus;
}
