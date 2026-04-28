import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateKilometersDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  kilometers: number;

  /* When true, allow setting a value below the current reading (admin override
     for correcting mistyped readings). Validated against role at the controller. */
  @IsOptional()
  @IsBoolean()
  allowDecrease?: boolean;
}
