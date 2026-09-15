import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/* COM-016 — edit a note's text. Only `body` is editable (same 1..5000 trimmed rule as
   create). `opportunityId` and `createdBy` are NOT editable — a note never moves
   between deals and never changes author; the service enforces author-only edits. */
export class UpdateOpportunityNoteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body: string;
}
