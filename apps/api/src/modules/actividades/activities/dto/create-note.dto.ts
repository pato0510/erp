import { IsString, MaxLength } from 'class-validator';

/* CAL-009 — a bitácora entry. `text` is validated here only for type/length; the non-empty
 * rule (both "" and whitespace-only "   " → 400) lives in the service so both give the SAME
 * Spanish message. `authorId` is NEVER in the DTO — it comes from the JWT actor. */
export class CreateNoteDto {
  @IsString()
  @MaxLength(4000)
  text: string;
}
