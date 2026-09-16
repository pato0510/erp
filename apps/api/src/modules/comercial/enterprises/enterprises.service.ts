import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { cleanRut, validateRut } from '@erp/utils';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { AssignAccountsDto } from './dto/assign-accounts.dto';
import { CreateEnterpriseDto } from './dto/create-enterprise.dto';
import { UpdateEnterpriseDto } from './dto/update-enterprise.dto';

const NAME_MAX_LENGTH = 200;

interface ListFilters {
  q?: string;
  includeInactive?: boolean;
}

/* COM-018 — the client's parent company. Every read carries an explicit companyId;
 * every write runs inside executeWithRls. Uniqueness is TWO-LAYER (the house idiom,
 * incident-persons.service.ts): a company-scoped pre-check yields the precise Spanish
 * 409, and the migration's unique indexes ((companyId, lower(name)) and the partial
 * (companyId, rut)) are the race backstop — P2002 → 409. No DELETE: deactivation only,
 * linked accounts keep their link.
 * COM-021 — the list carries `accountsCount` (Prisma _count, flattened) and
 * assignAccounts() bulk-links UNLINKED accounts to an active enterprise (skip, never
 * overwrite; reassignment lives in the account form). */
@Injectable()
export class EnterprisesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  /** Company-scoped list, ordered by name. Active only unless includeInactive. `q`
   * matches the name (case-insensitive) or the normalized RUT. COM-021: each row carries
   * `accountsCount` (number of accounts linked, any status). */
  async findAll(companyId: string, filters: ListFilters = {}) {
    const where: Prisma.EnterpriseWhereInput = { companyId };
    if (!filters.includeInactive) where.isActive = true;
    const q = filters.q?.trim();
    if (q) {
      const rutQuery = cleanRut(q);
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        ...(rutQuery ? [{ rut: { contains: rutQuery } }] : []),
      ];
    }
    const rows = await this.prisma.enterprise.findMany({
      where,
      orderBy: [{ name: 'asc' }],
      include: { _count: { select: { accounts: true } } },
    });
    return rows.map(({ _count, ...row }) => ({ ...row, accountsCount: _count.accounts }));
  }

  async create(companyId: string, userId: string, dto: CreateEnterpriseDto) {
    const name = this.normalizeName(dto.name);
    const rut = this.normalizeRut(dto.rut);
    await this.assertUnique(companyId, name, rut);
    try {
      return await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.enterprise.create({
          data: {
            companyId,
            createdBy: userId, // NEVER from input
            name,
            rut,
            industry: dto.industry?.trim() || null,
            notes: dto.notes?.trim() || null,
          },
        });
      });
    } catch (err) {
      this.rethrowUniqueViolation(err);
    }
  }

  async update(id: string, companyId: string, userId: string, dto: UpdateEnterpriseDto) {
    const existing = await this.findEnterprise(id, companyId);
    const data: Prisma.EnterpriseUncheckedUpdateInput = {};
    if (dto.name !== undefined) data.name = this.normalizeName(dto.name);
    if (dto.rut !== undefined) data.rut = this.normalizeRut(dto.rut);
    if (dto.industry !== undefined) data.industry = dto.industry?.trim() || null;
    if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    await this.assertUnique(
      companyId,
      typeof data.name === 'string' ? data.name : existing.name,
      data.rut === undefined ? existing.rut : (data.rut as string | null),
      id,
    );
    try {
      return await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.enterprise.update({ where: { id }, data });
      });
    } catch (err) {
      this.rethrowUniqueViolation(err);
    }
  }

  /** COM-021 — bulk-assign UNLINKED accounts to an ACTIVE enterprise of this company.
   * Rules: the enterprise must exist here and be active (400, the COM-018 message);
   * every accountId must exist here (400 with the COUNT of missing/foreign ids — never
   * their contents); accounts already linked to ANY enterprise are skipped, not
   * overwritten (the WHERE carries enterpriseId: null). Returns { assigned, skipped }. */
  async assignAccounts(
    id: string,
    companyId: string,
    userId: string,
    dto: AssignAccountsDto,
  ): Promise<{ assigned: number; skipped: number }> {
    const enterprise = await this.prisma.enterprise.findFirst({
      where: { id, companyId, isActive: true },
      select: { id: true },
    });
    if (!enterprise) {
      throw new BadRequestException('La empresa indicada no existe o está inactiva.');
    }
    const accountIds = Array.from(new Set(dto.accountIds));
    const found = await this.prisma.account.findMany({
      where: { id: { in: accountIds }, companyId },
      select: { id: true, enterpriseId: true },
    });
    const missing = accountIds.length - found.length;
    if (missing > 0) {
      throw new BadRequestException(
        `${missing} cuenta(s) no existen en esta empresa o no pertenecen a ella.`,
      );
    }
    const unlinkedIds = found.filter((a) => a.enterpriseId === null).map((a) => a.id);
    const skipped = found.length - unlinkedIds.length;
    if (unlinkedIds.length === 0) return { assigned: 0, skipped };
    const result = await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.account.updateMany({
        where: { id: { in: unlinkedIds }, companyId, enterpriseId: null },
        data: { enterpriseId: id },
      });
    });
    // A row linked between the read and the write is skipped by the WHERE, not overwritten.
    return { assigned: result.count, skipped: skipped + (unlinkedIds.length - result.count) };
  }

  /* ── validation ─────────────────────────────────────────────────────────── */

  private normalizeName(raw: string): string {
    const name = (raw ?? '').trim();
    if (name.length === 0) throw new BadRequestException('El nombre es obligatorio.');
    if (name.length > NAME_MAX_LENGTH) {
      throw new BadRequestException(
        `El nombre no puede superar los ${NAME_MAX_LENGTH} caracteres.`,
      );
    }
    return name;
  }

  /** Optional RUT: empty/null clears it; otherwise Módulo-11 validated and stored
   * canonical (separator-free) — the employees.service idiom. */
  private normalizeRut(raw: string | null | undefined): string | null {
    if (raw === undefined || raw === null) return null;
    if (raw.trim().length === 0) return null;
    if (!validateRut(raw)) {
      throw new BadRequestException('RUT inválido (dígito verificador no coincide).');
    }
    return cleanRut(raw);
  }

  /** Layer 1 of the uniqueness rule: precise, company-scoped pre-checks. */
  private async assertUnique(
    companyId: string,
    name: string,
    rut: string | null,
    excludeId?: string,
  ) {
    const notSelf = excludeId ? { id: { not: excludeId } } : {};
    const sameName = await this.prisma.enterprise.findFirst({
      where: { companyId, name: { equals: name, mode: 'insensitive' }, ...notSelf },
      select: { id: true },
    });
    if (sameName) throw new ConflictException('Ya existe una empresa con ese nombre.');
    if (rut) {
      const sameRut = await this.prisma.enterprise.findFirst({
        where: { companyId, rut, ...notSelf },
        select: { id: true },
      });
      if (sameRut) throw new ConflictException('Ya existe una empresa con ese RUT.');
    }
  }

  /** Layer 2: the DB unique indexes (race backstop) — P2002 → 409. */
  private rethrowUniqueViolation(err: unknown): never {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const target = String((err.meta as { target?: unknown } | undefined)?.target ?? '');
      throw new ConflictException(
        target.includes('rut')
          ? 'Ya existe una empresa con ese RUT.'
          : 'Ya existe una empresa con ese nombre.',
      );
    }
    throw err;
  }

  private async findEnterprise(id: string, companyId: string) {
    const enterprise = await this.prisma.enterprise.findFirst({ where: { id, companyId } });
    if (!enterprise) throw new NotFoundException('Empresa no encontrada');
    return enterprise;
  }
}
