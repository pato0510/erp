import { IsEnum } from 'class-validator';
import { CrmQuoteStatus } from '@prisma/client';

/** Transitions a quote to a new status (BORRADOR → EN_REVISION → ENVIADA …). */
export class QuoteStatusDto {
  @IsEnum(CrmQuoteStatus)
  status: CrmQuoteStatus;
}
