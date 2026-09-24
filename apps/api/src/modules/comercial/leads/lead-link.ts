import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CommercialActivityEvent, Prisma } from '@prisma/client';

/** Serialize origin/account edits before reading the previous link, so competing
 * POST create-and-link / PATCH requests record the actual before/after pair. */
export async function lockLeadOpportunity(
  tx: Prisma.TransactionClient,
  companyId: string,
  opportunityId: string,
) {
  await tx.$queryRaw(Prisma.sql`
    SELECT id FROM opportunities
    WHERE "companyId" = ${companyId}::uuid AND id = ${opportunityId}::uuid
    FOR UPDATE
  `);
}

/** Shared by create-and-link and general opportunity edits. Call on their tx,
 * after locking the opportunity. The effective account is the account AFTER PATCH. */
export async function prepareLeadChange(
  tx: Prisma.TransactionClient,
  companyId: string,
  accountId: string,
  beforeId: string | null,
  afterId: string | null,
): Promise<{ event: CommercialActivityEvent; subject: string } | null> {
  const after = afterId
    ? await tx.lead.findFirst({
        where: { id: afterId, companyId },
        select: { id: true, name: true, accountId: true },
      })
    : null;
  if (afterId && !after) throw new NotFoundException('Lead no encontrado');
  if (after && after.accountId !== accountId) {
    throw new BadRequestException('El lead debe ser de la misma cuenta que la oportunidad.');
  }
  if (beforeId === afterId) return null;
  const before = beforeId
    ? await tx.lead.findFirst({
        where: { id: beforeId, companyId },
        select: { name: true },
      })
    : null;
  if (beforeId && !before) throw new NotFoundException('Lead no encontrado');
  if (after) {
    return {
      event: 'LEAD',
      subject: before ? `Lead: ${before.name} → ${after.name}` : `Lead vinculado: ${after.name}`,
    };
  }
  if (before) {
    return { event: 'LEAD_DESVINCULADO', subject: `Lead desvinculado (era ${before.name})` };
  }
  return null;
}
