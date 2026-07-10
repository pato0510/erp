import { CampaignChannel } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MaxLength,
} from 'class-validator';

/* MKT-002 — create a campaign. Always starts at status BORRADOR (status is NOT
   settable here — status changes go through PATCH /:id/status so the transition
   rules are the only path to ACTIVA/PAUSADA/FINALIZADA/CANCELADA). createdBy comes
   from the JWT actor in the service, never from the DTO. */
export class CreateCampaignDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsEnum(CampaignChannel)
  channel: CampaignChannel;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  // Date-only (YYYY-MM-DD or ISO); stored UTC-anchored @db.Date in the service
  // (HR-004b convention). Required to ACTIVATE (guarded in the status machine),
  // NOT to create a draft (decision f).
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  // CLP budget — persisted as Decimal(18,2). Non-negative. Open-ended campaigns may
  // have none. Spend/over-budget are computed live (MKT-005), never stored.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  budgetAmount?: number;

  // Campaign owner — bare actor UUID (no FK / no user-existence lookup, codebase
  // convention).
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
