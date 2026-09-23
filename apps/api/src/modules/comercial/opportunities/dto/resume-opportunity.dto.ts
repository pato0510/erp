import { IsDateString, IsNumber, Min, ValidateIf } from 'class-validator';

/** Optional fill-in fields are numbers/dates when present; null cannot erase on entry. */
export class ResumeOpportunityDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El valor estimado debe ser un número con hasta 2 decimales.' },
  )
  @Min(0, { message: 'El valor estimado debe ser mayor o igual a 0.' })
  estimatedValue?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsDateString(
    { strict: true },
    { message: 'La fecha estimada de cierre debe ser una fecha válida.' },
  )
  expectedCloseDate?: string;
}
