import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  /** List by account — the natural access path. accountId is required. */
  async findAll(companyId: string, accountId: string) {
    if (!accountId) throw new BadRequestException('accountId requerido');
    return this.prisma.contact.findMany({
      where: { companyId, accountId },
      orderBy: [{ isPrimary: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  async findOne(id: string, companyId: string) {
    const contact = await this.prisma.contact.findFirst({ where: { id, companyId } });
    if (!contact) throw new NotFoundException('Contacto no encontrado');
    return contact;
  }

  async create(companyId: string, userId: string, dto: CreateContactDto) {
    await this.assertAccountInCompany(dto.accountId, companyId);
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      // Single-primary rule: a new primary unsets any existing primary of the SAME account.
      if (dto.isPrimary) {
        await tx.contact.updateMany({
          where: { companyId, accountId: dto.accountId, isPrimary: true },
          data: { isPrimary: false },
        });
      }
      return tx.contact.create({
        data: {
          companyId,
          createdBy: userId,
          accountId: dto.accountId,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: dto.role ?? null,
          email: dto.email ?? null,
          phone: dto.phone ?? null,
          isPrimary: dto.isPrimary ?? false,
          notes: dto.notes ?? null,
        },
      });
    });
  }

  async update(id: string, companyId: string, userId: string, dto: UpdateContactDto) {
    const existing = await this.findOne(id, companyId);
    // If the account is being (re)set, re-validate it is in this company.
    if (dto.accountId) {
      await this.assertAccountInCompany(dto.accountId, companyId);
    }
    const accountId = dto.accountId ?? existing.accountId;
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      // Single-primary rule: setting isPrimary=true unsets any OTHER primary of the
      // same account. Setting isPrimary=false is always allowed (no unset needed).
      if (dto.isPrimary === true) {
        await tx.contact.updateMany({
          where: { companyId, accountId, isPrimary: true, id: { not: id } },
          data: { isPrimary: false },
        });
      }
      const data: Prisma.ContactUncheckedUpdateInput = { ...dto };
      return tx.contact.update({ where: { id }, data });
    });
  }

  /** Hard delete — contacts are simple child rows with NO lifecycle field
   * (no status/isActive to soft-deactivate, unlike accounts/service_catalog). The
   * FK ON DELETE CASCADE also removes them when their account is deleted. */
  async remove(id: string, companyId: string, userId: string) {
    await this.findOne(id, companyId);
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.contact.delete({ where: { id } });
    });
  }

  /** Company-scoped existence check for the parent account. Rejects a reference to
   * an account that does not exist OR belongs to another company. */
  private async assertAccountInCompany(accountId: string, companyId: string) {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, companyId },
      select: { id: true },
    });
    if (!account) {
      throw new BadRequestException('Cuenta no encontrada en esta empresa.');
    }
  }
}
