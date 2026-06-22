import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class StagesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Ordered pipeline stages for the company. */
  async findAll(companyId: string) {
    const stages = await this.prisma.crmStage.findMany({
      where: { companyId },
      orderBy: { order: 'asc' },
    });
    return stages.map((s) => ({
      id: s.id,
      name: s.name,
      order: s.order,
      isWon: s.isWon,
      isLost: s.isLost,
    }));
  }
}
