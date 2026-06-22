import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class SeoService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lists tracked keywords with a derived `delta` = previousPosition −
   * currentPosition. Search positions are "lower is better", so a positive
   * delta means the keyword IMPROVED (moved up the results). Sorted best
   * current position first.
   */
  async findAll(companyId: string) {
    const keywords = await this.prisma.seoKeyword.findMany({
      where: { companyId },
      orderBy: { currentPosition: 'asc' },
    });
    return keywords.map((k) => ({
      id: k.id,
      keyword: k.keyword,
      currentPosition: k.currentPosition,
      previousPosition: k.previousPosition,
      monthlyTraffic: k.monthlyTraffic,
      url: k.url,
      delta: k.previousPosition - k.currentPosition,
    }));
  }
}
