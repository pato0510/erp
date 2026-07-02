import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateContactDto {
  // Required parent account (validated company-scoped in the service).
  @IsUUID()
  accountId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  lastName: string;

  // Job title at the client (free text).
  @IsOptional()
  @IsString()
  @MaxLength(120)
  role?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
