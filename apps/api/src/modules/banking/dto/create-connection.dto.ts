import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CreateConnectionDto {
  @IsUUID()
  bankAccountId: string;

  @IsString()
  @IsNotEmpty()
  provider = 'mock';

  @IsString()
  @IsNotEmpty()
  providerAccountId: string;
}
