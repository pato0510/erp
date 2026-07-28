import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { CreateEppItemDto } from './dto/create-epp-item.dto';
import { UpdateEppItemDto } from './dto/update-epp-item.dto';
import { DEFAULT_EPP_ITEMS } from './epp-items.constants';

/* HSEC-008 — the EPP catalog. INACTIVATE-NOT-DELETE when used (the ActivityArea pattern):
 * DELETE is pristine-only — a referenced item's DB Restrict (P2003) is caught and turned
 * into the Spanish 409 pointing at the inactivate path. Duplicate name → P2002 → 409 (the
 * house two-layer style). seedDefaults is the OPS-004 idempotent upsert over the constants
 * catalog. */
@Injectable()
export class EppItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  private async getItemOrThrow(id: string, companyId: string) {
    const item = await this.prisma.hsecEppItem.findFirst({ where: { id, companyId } });
    if (!item) throw new NotFoundException('Elemento no encontrado');
    return item;
  }

  async findAll(companyId: string) {
    return this.prisma.hsecEppItem.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    });
  }

  async create(companyId: string, userId: string, dto: CreateEppItemDto) {
    try {
      return await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.hsecEppItem.create({ data: { companyId, name: dto.name.trim() } });
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un elemento con ese nombre.');
      }
      throw e;
    }
  }

  async update(id: string, companyId: string, userId: string, dto: UpdateEppItemDto) {
    await this.getItemOrThrow(id, companyId);
    const data: Prisma.HsecEppItemUncheckedUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.active !== undefined) data.active = dto.active;
    try {
      return await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.hsecEppItem.update({ where: { id }, data });
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un elemento con ese nombre.');
      }
      throw e;
    }
  }

  /** PRISTINE ONLY — the lines FK is ON DELETE RESTRICT; a referenced item's P2003 becomes
   *  the Spanish 409 (inactivate instead). */
  async remove(id: string, companyId: string, userId: string) {
    await this.getItemOrThrow(id, companyId);
    try {
      return await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.hsecEppItem.delete({ where: { id } });
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
        throw new ConflictException(
          'El elemento tiene entregas registradas; desactivalo en su lugar.',
        );
      }
      throw e;
    }
  }

  /** OPS-004 pattern — idempotent upsert on (companyId, name): re-running adds whatever is
   *  missing without touching existing rows (renames/deactivations survive re-seeds only for
   *  names that no longer match; a re-seed re-creates a renamed default's original name —
   *  the OPS-004 behavior). */
  async seedDefaults(companyId: string, userId: string) {
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      let created = 0;
      for (const name of DEFAULT_EPP_ITEMS) {
        const existing = await tx.hsecEppItem.findFirst({ where: { companyId, name } });
        if (!existing) {
          await tx.hsecEppItem.create({ data: { companyId, name } });
          created++;
        }
      }
      const total = await tx.hsecEppItem.count({ where: { companyId } });
      return { created, total };
    });
  }
}
