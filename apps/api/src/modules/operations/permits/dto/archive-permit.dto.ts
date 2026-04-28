import { IsString, MaxLength, MinLength } from 'class-validator';

export class ArchivePermitDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;
}
