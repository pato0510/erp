import { IsEmail, IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { UserRole } from '@prisma/client';
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
}
