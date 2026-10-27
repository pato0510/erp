import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { AccessModule, UserRole } from '@prisma/client';
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

  /* ACCESS-001 — full replacement of the membership's blocked modules. The service
     rejects a non-empty list on SUPER_ADMIN/ADMIN and any change to the actor's own. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(AccessModule, { each: true })
  restrictedModules?: AccessModule[];
}
