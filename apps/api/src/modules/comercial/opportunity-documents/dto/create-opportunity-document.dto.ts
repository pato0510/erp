import { OpportunityDocumentKind } from '@prisma/client';
import { IsEnum, IsUUID } from 'class-validator';

/* COM-017 — attach a file to an opportunity. Multipart body: `opportunityId` + `kind`
   as text fields, the bytes under the `file` part (FileInterceptor). The service
   verifies the opportunity exists in the caller's company (404 otherwise — existence
   never leaks across tenants) and validates the file (MIME allowlist, extension/MIME
   agreement, size, sanitized name) BEFORE any storage call.

   `fileName`, `mimeType`, `sizeBytes`, `storageKey` and `createdBy` are intentionally
   ABSENT — all derived server-side (the name/MIME/size from the multipart part, the
   key from the ids, the author from the JWT). */
export class CreateOpportunityDocumentDto {
  @IsUUID()
  opportunityId: string;

  @IsEnum(OpportunityDocumentKind)
  kind: OpportunityDocumentKind;
}
