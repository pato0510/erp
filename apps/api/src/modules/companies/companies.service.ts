import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { RlsService } from '../common/rls/rls.service';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  async getCompanyById(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: { companySettings: true, tenant: true },
    });
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  async getSettings(companyId: string) {
    return this.prisma.companySettings.upsert({
      where: { companyId },
      update: {},
      create: { companyId },
    });
  }

  async updateSettings(companyId: string, userId: string, dto: UpdateSettingsDto) {
    // Ensure settings exist first
    await this.getSettings(companyId);

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.companySettings.update({
        where: { companyId },
        data: dto,
      });
    });
  }

  async updateCompany(companyId: string, userId: string, dto: UpdateCompanyDto) {
    const exists = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!exists) throw new NotFoundException('Company not found');

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.company.update({
        where: { id: companyId },
        data: dto,
      });
    });
  }
}
