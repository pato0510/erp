import { QuoteStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

/* COM-010 — the canonical status-change payload. The service enforces the machine
   (BORRADOR→ENVIADA, ENVIADA→ACEPTADA|RECHAZADA; terminal states reject). */
export class ChangeQuoteStatusDto {
  @IsEnum(QuoteStatus)
  status: QuoteStatus;
}
