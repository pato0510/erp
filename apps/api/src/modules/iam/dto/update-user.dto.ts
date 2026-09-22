import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { UserRole } from '@prisma/client';
import { IsPassword } from '../password-policy';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ValidateIf((_object, value) => value !== undefined)
  @IsPassword()
  password?: string;
}
