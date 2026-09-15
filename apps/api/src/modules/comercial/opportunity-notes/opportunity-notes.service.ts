import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppAbility, OpportunityNoteSubject } from '../../common/casl/casl-ability.factory';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { CreateOpportunityNoteDto } from './dto/create-opportunity-note.dto';
import { UpdateOpportunityNoteDto } from './dto/update-opportunity-note.dto';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;
const MAX_BODY_LENGTH = 5000;

/* COM-016 — the internal note thread on a deal. Same shape as ActivitiesService: the
 * opportunity is verified to exist IN THE CALLER'S COMPANY before any read/write (404
 * otherwise — existence never leaks across tenants); every write runs inside
 * executeWithRls; createdBy comes from the JWT user, never from the DTO. */
@Injectable()
export class OpportunityNotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  /** The thread, newest-first (createdAt DESC — editing a note never reorders it). */
  async findAllByOpportunity(companyId: string, opportunityId: string, limit?: number) {
    await this.assertOpportunityInCompany(opportunityId, companyId);
    return this.prisma.opportunityNote.findMany({
      where: { companyId, opportunityId },
      orderBy: [{ createdAt: 'desc' }],
      take: this.clampLimit(limit),
    });
  }

  /** CREATE — the author is the JWT user (never input). */
  async create(companyId: string, userId: string, dto: CreateOpportunityNoteDto) {
    await this.assertOpportunityInCompany(dto.opportunityId, companyId);
    const body = this.normalizeBody(dto.body);
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.opportunityNote.create({
        data: {
          companyId,
          opportunityId: dto.opportunityId,
          body,
          createdBy: userId, // NEVER from input
        },
      });
    });
  }

  /** UPDATE — only the author may edit (403 otherwise). Only `body` changes. */
  async update(companyId: string, userId: string, id: string, dto: UpdateOpportunityNoteDto) {
    const existing = await this.findNote(id, companyId);
    if (existing.createdBy !== userId) {
      throw new ForbiddenException('Solo el autor puede editar esta nota.');
    }
    const body = this.normalizeBody(dto.body);
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.opportunityNote.update({ where: { id }, data: { body } });
    });
  }

  /** DELETE — the author, or a caller whose ability carries `manage` on this subject
   * (ADMIN/SUPER_ADMIN via `manage all`; MANAGER has CRUD but not manage). The ability
   * is the one PoliciesGuard built (@CurrentAbility) — never a role string. */
  async remove(companyId: string, userId: string, id: string, ability: AppAbility) {
    const existing = await this.findNote(id, companyId);
    const isAuthor = existing.createdBy === userId;
    if (!isAuthor && !ability.can('manage', OpportunityNoteSubject)) {
      throw new ForbiddenException('Solo el autor o un administrador puede eliminar esta nota.');
    }
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.opportunityNote.delete({ where: { id } });
    });
  }

  /** Trim, then enforce 1..5000. The DTO already caps the raw length; this catches a
   * whitespace-only body (IsNotEmpty passes "   ") and re-checks after trimming. */
  private normalizeBody(raw: string): string {
    const body = typeof raw === 'string' ? raw.trim() : '';
    if (body.length === 0) throw new BadRequestException('La nota no puede estar vacía.');
    if (body.length > MAX_BODY_LENGTH) {
      throw new BadRequestException(`La nota no puede superar los ${MAX_BODY_LENGTH} caracteres.`);
    }
    return body;
  }

  private async findNote(id: string, companyId: string) {
    const note = await this.prisma.opportunityNote.findFirst({ where: { id, companyId } });
    if (!note) throw new NotFoundException('Nota no encontrada');
    return note;
  }

  private async assertOpportunityInCompany(opportunityId: string, companyId: string) {
    const opp = await this.prisma.opportunity.findFirst({
      where: { id: opportunityId, companyId },
      select: { id: true },
    });
    if (!opp) throw new NotFoundException('Oportunidad no encontrada');
  }

  private clampLimit(limit?: number) {
    if (!limit || limit <= 0) return DEFAULT_LIMIT;
    return Math.min(limit, MAX_LIMIT);
  }
}
