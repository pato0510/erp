import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateAreaDto } from './create-area.dto';

/* CAL-002 — edit an area: name / color (both optional here) + the soft-deactivate toggle
   `active`. Deactivation is the non-destructive path — inactive areas stop appearing in the
   activity forms (from CAL-003) but existing activities keep rendering. */
export class UpdateAreaDto extends PartialType(CreateAreaDto) {
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
