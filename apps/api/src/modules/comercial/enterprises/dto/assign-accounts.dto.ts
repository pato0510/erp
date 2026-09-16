import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';

/* COM-021 — bulk-assign accounts to an enterprise. 1..200 account UUIDs. The service
   validates that every id exists in the caller's company (400 with a COUNT of the
   missing/foreign ids, never their contents) and assigns ONLY accounts with no
   enterprise yet — already-linked accounts are skipped, never overwritten
   (reassignment lives in the account form, deliberately). */
export class AssignAccountsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  accountIds: string[];
}
