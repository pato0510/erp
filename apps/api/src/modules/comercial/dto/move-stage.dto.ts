import { IsUUID } from 'class-validator';

/** Moves an opportunity to a new stage. If the target stage isWon, the
 * simulated Finanzas commitment fields are set; if moving out of a won stage
 * they are cleared. */
export class MoveStageDto {
  @IsUUID()
  stageId: string;
}
