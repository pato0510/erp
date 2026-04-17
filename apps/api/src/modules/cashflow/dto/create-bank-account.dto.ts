import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { AccountType } from '@prisma/client';

export class CreateBankAccountDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  accountNumber?: string;

  @IsEnum(AccountType)
  type: AccountType;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  bankName?: string;
}
