import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async findByTable(tableName: string, companyId: string, skip = 0, take = 50) {
    return this.prisma.auditLog.findMany({
      where: { tableName, tenantId: companyId },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  }

  async findByUser(userId: string, companyId: string, skip = 0, take = 50) {
    return this.prisma.auditLog.findMany({
      where: { userId, tenantId: companyId },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  }

  async findRecent(companyId: string, limit = 20) {
    return this.prisma.auditLog.findMany({
      where: { tenantId: companyId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
