import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

/* COM-016 — write an internal note on an opportunity. `opportunityId` identifies the
   deal (the service verifies it exists in the caller's company — 404 otherwise, never
   leaking existence across tenants). `body` is free text: 1..5000 chars after trimming
   (the service trims and re-validates; whitespace-only is a 400).

   `createdBy` is intentionally ABSENT — it is never accepted from input; the
   controller takes it from the JWT user. */
export class CreateOpportunityNoteDto {
  @IsUUID()
  opportunityId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body: string;
}
