import { IsOptional, IsUUID, IsString, MaxLength } from 'class-validator';

export class ManualMatchDto {
  @IsOptional()
  @IsUUID()
  externalMovementId?: string;

  @IsOptional()
  @IsUUID()
  taxDocumentId?: string;

  @IsOptional()
  @IsUUID()
  movementId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class RejectMatchDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
