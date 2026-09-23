import {
  IsDateString,
  IsDivisibleBy,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

import { OpportunityStage } from '@prisma/client';
import { PROBABILITY_MESSAGE } from '../stage-probabilities';

export const ACTIVE_STAGES: OpportunityStage[] = [
  'PROSPECTO',
  'CONTACTO',
  'VISITA_TECNICA',
  'COTIZACION',
  'NEGOCIACION',
];

/* COM-023 — create in any active stage, PROSPECTO when omitted. */
export class CreateOpportunityDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(ACTIVE_STAGES, {
    message:
      'La etapa inicial debe ser Prospecto, Contacto, Visita Técnica, Cotización o Negociación.',
  })
  stage?: OpportunityStage;

  // Required parent account (validated company-scoped in the service).
  @IsUUID()
  accountId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  // CLP money — persisted as Decimal(18,2). Non-negative.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  estimatedValue?: number | null;

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt({ message: PROBABILITY_MESSAGE })
  @Min(0, { message: PROBABILITY_MESSAGE })
  @Max(100, { message: PROBABILITY_MESSAGE })
  @IsDivisibleBy(10, { message: PROBABILITY_MESSAGE })
  probability?: number;

  // Date-only (YYYY-MM-DD or ISO); stored UTC-anchored @db.Date in the service.
  @IsOptional()
  @IsDateString()
  expectedCloseDate?: string | null;

  // Commercial executive — bare actor UUID (no FK, codebase convention).
  @IsOptional()
  @IsUUID()
  ownerId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
