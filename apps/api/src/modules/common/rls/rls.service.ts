import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RlsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Executes a function inside a Prisma transaction with RLS scoped to the given companyId.
   * SET LOCAL only lasts for the current transaction — once the transaction ends,
   * the setting is automatically discarded.
   */
  async executeWithRls<T>(
    companyId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL rls.company_id = '${companyId}'`);
      return fn(tx);
    });
  }
}
