import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { AccessModule, UserRole } from '@prisma/client';
import { IsPassword } from '../password-policy';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName: string;

  @IsEmail()
  @MaxLength(200)
  email: string;

  @IsPassword()
  password: string;

  @IsEnum(UserRole)
  role: UserRole;

  /* ACCESS-001 — modules this membership is blocked from. Omitted = none. The service
     rejects a non-empty list on SUPER_ADMIN/ADMIN. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(AccessModule, { each: true })
  restrictedModules?: AccessModule[];
}
