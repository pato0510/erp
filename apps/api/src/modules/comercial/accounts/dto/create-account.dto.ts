import { AccountPriority, AccountStatus } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateAccountDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsEnum(AccountStatus)
  status?: AccountStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  industry?: string;

  @IsOptional()
  @IsEnum(AccountPriority)
  priority?: AccountPriority;

  // Free-text commercial-risk note for V1 (not an enum).
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  commercialRisk?: string;

  // Commercial executive — bare actor UUID (no FK, codebase convention).
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  // Optional link to a Finance counterparty (validated company-scoped in the service).
  @IsOptional()
  @IsUUID()
  counterpartyId?: string;

  // Prepared hook for the future Marketing module — no FK yet.
  @IsOptional()
  @IsUUID()
  sourceCampaignId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
