import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class TenancyService {
  constructor(private readonly prisma: PrismaService) {}

  async findTenantById(id: string) {
    return this.prisma.tenant.findUnique({
      where: { id },
      include: { companies: true },
    });
  }

  async findCompanyById(id: string) {
    return this.prisma.company.findUnique({
      where: { id },
      include: { tenant: true },
    });
  }

  async findCompaniesByTenant(tenantId: string) {
    return this.prisma.company.findMany({
      where: { tenantId },
    });
  }
}
