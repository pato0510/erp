import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RlsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Executes a function inside a Prisma transaction with:
   * - RLS scoped to the given companyId (SET LOCAL rls.company_id)
   * - Audit context injected (SET LOCAL audit.user_id, audit.company_id)
   *
   * SET LOCAL only lasts for the current transaction — once the transaction ends,
   * the settings are automatically discarded.
   */
  async executeWithRls<T>(
    companyId: string,
    userId: string | null,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL rls.company_id = '${companyId}'`);
      await tx.$executeRawUnsafe(`SET LOCAL audit.company_id = '${companyId}'`);
      if (userId) {
        await tx.$executeRawUnsafe(`SET LOCAL audit.user_id = '${userId}'`);
        /* OPS-022 — per-user RLS context. user_notifications uses this
           to enforce "users only see their own notifications" while
           still keeping the company-scoped guard. */
        await tx.$executeRawUnsafe(`SET LOCAL rls.user_id = '${userId}'`);
      }
      return fn(tx);
    });
  }
}
