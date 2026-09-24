import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { writeSystemActivity } from '../activities/system-activity';
import { CreateLeadDto } from './dto/create-lead.dto';
import { LeadsQueryDto } from './dto/leads-query.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { lockLeadOpportunity, prepareLeadChange } from './lead-link';

const DUPLICATE_NAME = 'Ya existe un lead con ese nombre en esta cuenta.';

function rowSelect(companyId: string) {
  return {
    id: true,
    name: true,
    accountId: true,
    account: { select: { id: true, name: true } },
    contactId: true,
    contact: { select: { id: true, firstName: true, lastName: true } },
    createdBy: true,
    createdAt: true,
    updatedAt: true,
    _count: { select: { opportunities: { where: { companyId } } } },
  } as const satisfies Prisma.LeadSelect;
}

function detailSelect(companyId: string) {
  return {
    ...rowSelect(companyId),
    contact: {
      select: { id: true, firstName: true, lastName: true, role: true, email: true, phone: true },
    },
    opportunities: {
      where: { companyId },
      orderBy: [{ createdAt: 'desc' }],
      select: {
        id: true,
        name: true,
        stage: true,
        estimatedValue: true,
        expectedCloseDate: true,
        ownerId: true,
        closedAt: true,
        createdAt: true,
      },
    },
  } as const satisfies Prisma.LeadSelect;
}

function flattenCount<T extends { _count: { opportunities: number } }>(row: T) {
  const { _count, ...fields } = row;
  return { ...fields, opportunitiesCount: _count.opportunities };
}

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  async findAll(companyId: string, filters: LeadsQueryDto = {}) {
    const q = filters.q?.trim();
    const rows = await this.prisma.lead.findMany({
      where: {
        companyId,
        ...(filters.accountId ? { accountId: filters.accountId } : {}),
        ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
      },
      select: rowSelect(companyId),
      orderBy: [{ name: 'asc' }],
    });
    return rows.map(flattenCount);
  }

  async findOne(id: string, companyId: string) {
    return this.findDetail(this.prisma, id, companyId);
  }

  async create(companyId: string, userId: string, dto: CreateLeadDto) {
    const name = this.normalizeName(dto.name);
    try {
      return await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        const account = await tx.account.findFirst({
          where: { id: dto.accountId, companyId },
          select: { id: true },
        });
        if (!account) throw new BadRequestException('Cuenta no encontrada en esta empresa.');
        await this.assertContact(tx, companyId, dto.accountId, dto.contactId);
        await this.assertUnique(tx, companyId, dto.accountId, name);
        let opportunity: { id: string; accountId: string; leadId: string | null } | null = null;
        if (dto.opportunityId) {
          await lockLeadOpportunity(tx, companyId, dto.opportunityId);
          opportunity = await tx.opportunity.findFirst({
            where: { id: dto.opportunityId, companyId },
            select: { id: true, accountId: true, leadId: true },
          });
          if (!opportunity) throw new NotFoundException('Oportunidad no encontrada');
          if (opportunity.accountId !== dto.accountId)
            throw new BadRequestException('La oportunidad es de otra cuenta.');
        }
        const lead = await tx.lead.create({
          data: {
            companyId,
            accountId: dto.accountId,
            contactId: dto.contactId ?? null,
            name,
            createdBy: userId,
          },
        });
        if (opportunity) {
          const change = await prepareLeadChange(
            tx,
            companyId,
            dto.accountId,
            opportunity.leadId,
            lead.id,
          );
          await tx.opportunity.update({
            where: { id: opportunity.id, companyId },
            data: { leadId: lead.id },
          });
          if (change)
            await writeSystemActivity(tx, {
              companyId,
              accountId: dto.accountId,
              opportunityId: opportunity.id,
              userId,
              ...change,
            });
        }
        return this.findDetail(tx, lead.id, companyId);
      });
    } catch (error) {
      this.rethrowUniqueViolation(error);
    }
  }

  async update(id: string, companyId: string, userId: string, dto: UpdateLeadDto) {
    try {
      return await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        const existing = await tx.lead.findFirst({ where: { id, companyId } });
        if (!existing) throw new NotFoundException('Lead no encontrado');
        const name = dto.name === undefined ? existing.name : this.normalizeName(dto.name);
        const contactId = dto.contactId === undefined ? existing.contactId : dto.contactId;
        await this.assertContact(tx, companyId, existing.accountId, contactId);
        await this.assertUnique(tx, companyId, existing.accountId, name, id);
        await tx.lead.update({
          where: { id, companyId },
          data: {
            ...(dto.name !== undefined ? { name } : {}),
            ...(dto.contactId !== undefined ? { contactId } : {}),
          },
        });
        return this.findDetail(tx, id, companyId);
      });
    } catch (error) {
      this.rethrowUniqueViolation(error);
    }
  }

  async remove(id: string, companyId: string, userId: string) {
    try {
      return await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        const existing = await tx.lead.findFirst({
          where: { id, companyId },
          select: { id: true },
        });
        if (!existing) throw new NotFoundException('Lead no encontrado');
        const count = await tx.opportunity.count({ where: { companyId, leadId: id } });
        if (count > 0) throw this.linkedConflict(count);
        await tx.lead.delete({ where: { id, companyId } });
        return { id };
      });
    } catch (error) {
      // The failed transaction is already rolled back; count on a fresh RLS tx.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        const count = await this.rlsService.executeWithRls(companyId, userId, (tx) =>
          tx.opportunity.count({ where: { companyId, leadId: id } }),
        );
        throw this.linkedConflict(count);
      }
      throw error;
    }
  }

  private async findDetail(client: Prisma.TransactionClient, id: string, companyId: string) {
    const lead = await client.lead.findFirst({
      where: { id, companyId },
      select: detailSelect(companyId),
    });
    if (!lead) throw new NotFoundException('Lead no encontrado');
    return flattenCount(lead);
  }

  private normalizeName(raw: string): string {
    if (typeof raw !== 'string') throw new BadRequestException('El nombre debe ser un texto.');
    const name = raw.trim();
    if (!name) throw new BadRequestException('El nombre es obligatorio.');
    if (Array.from(name).length > 200)
      throw new BadRequestException('El nombre no puede superar los 200 caracteres.');
    return name;
  }

  private async assertContact(
    tx: Prisma.TransactionClient,
    companyId: string,
    accountId: string,
    contactId?: string | null,
  ) {
    if (contactId == null) return;
    const contact = await tx.contact.findFirst({
      where: { id: contactId, companyId, accountId },
      select: { id: true },
    });
    if (!contact) throw new BadRequestException('El contacto debe ser de la cuenta del lead.');
  }

  private async assertUnique(
    tx: Prisma.TransactionClient,
    companyId: string,
    accountId: string,
    name: string,
    excludeId?: string,
  ) {
    // Match the unique index exactly. Prisma's insensitive equals uses ILIKE,
    // which treats literal '%' / '_' in names as patterns and yields false 409s.
    const duplicate = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM leads
      WHERE "companyId" = ${companyId}::uuid AND "accountId" = ${accountId}::uuid
        AND lower(name) = lower(${name})
        ${excludeId ? Prisma.sql`AND id <> ${excludeId}::uuid` : Prisma.empty}
      LIMIT 1
    `);
    if (duplicate.length > 0) throw new ConflictException(DUPLICATE_NAME);
  }

  private rethrowUniqueViolation(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      throw new ConflictException(DUPLICATE_NAME);
    throw error;
  }

  private linkedConflict(count: number) {
    return new ConflictException(
      `Este lead tiene ${count} oportunidad(es) vinculada(s); desvincúlalas antes de eliminarlo.`,
    );
  }
}
