import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

/**
 * READ-ONLY passthrough over the Finance `categories` table so the Marketing UI
 * can tag an expense with an existing Finance category (display reference
 * only). This service NEVER writes to Finance.
 */
@Injectable()
export class FinanceCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string) {
    const categories = await this.prisma.category.findMany({
      where: { companyId, isActive: true },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, type: true },
    });
    return categories.map((c) => ({ id: c.id, name: c.name, type: c.type }));
  }
}
