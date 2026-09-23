import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDivisibleBy,
  IsIn,
  IsInt,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { OpportunityStage } from '@prisma/client';
import { EDITABLE_PROBABILITY_STAGES, PROBABILITY_MESSAGE } from '../stage-probabilities';

export class StageProbabilityItemDto {
  @IsIn(EDITABLE_PROBABILITY_STAGES, {
    message: 'Solo se pueden configurar las seis etapas editables.',
  })
  stage: OpportunityStage;

  @IsInt({ message: PROBABILITY_MESSAGE })
  @Min(0, { message: PROBABILITY_MESSAGE })
  @Max(100, { message: PROBABILITY_MESSAGE })
  @IsDivisibleBy(10, { message: PROBABILITY_MESSAGE })
  probability: number;
}

export class UpdateStageProbabilitiesDto {
  @IsArray({ message: 'Debes enviar entre 1 y 6 etapas.' })
  @ArrayMinSize(1, { message: 'Debes enviar entre 1 y 6 etapas.' })
  @ArrayMaxSize(6, { message: 'Debes enviar entre 1 y 6 etapas.' })
  @ArrayUnique((item: StageProbabilityItemDto) => item?.stage, {
    message: 'No puedes repetir una etapa.',
  })
  @ValidateNested({ each: true, message: 'Cada etapa debe incluir stage y probability.' })
  @Type(() => StageProbabilityItemDto)
  items: StageProbabilityItemDto[];
}
