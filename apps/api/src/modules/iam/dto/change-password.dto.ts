import { IsNotEmpty, IsString } from 'class-validator';
import { IsPassword } from '../password-policy';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @IsPassword()
  newPassword: string;
}
