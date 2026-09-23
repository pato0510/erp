import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';
import { ResumeOpportunityDto } from './resume-opportunity.dto';

export class ReopenOpportunityDto extends ResumeOpportunityDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Reabrir requiere un motivo.' })
  @Length(3, 500, {
    message: (args) =>
      typeof args.value !== 'string' || !args.value.trim()
        ? 'Reabrir requiere un motivo.'
        : 'Reabrir requiere un motivo de entre 3 y 500 caracteres.',
  })
  reason: string;
}
