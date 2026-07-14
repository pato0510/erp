import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { UpsertPresenceDto } from './dto/upsert-presence.dto';

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/;

@Injectable()
export class PresenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  /** Normalize a 'YYYY-MM' or 'YYYY-MM-DD' string to the FIRST day of that month at UTC
   * midnight (HR-004b). Only year+month are read — the day part is discarded — so the
   * stored `period` is timezone-stable regardless of the caller's clock. */
  private normalizePeriod(period: string): Date {
    const [year, month] = period.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, 1));
  }

  /* MKT-008 — the monthly upsert. FULL-REPLACE semantics: the month's snapshot IS what
     you submit — a metric field NOT sent becomes null on that row (MKT-009's form
     pre-fills existing values, so nothing is lost by accident). Upsert keys on the
     (companyId, period) unique index: the first submit inserts, any later submit for the
     same month UPDATES the same row — never a second row. */
  async upsert(companyId: string, userId: string, dto: UpsertPresenceDto) {
    // Cross-field rule: at least one of the three metrics must be present.
    if (
      dto.webVisits === undefined &&
      dto.linkedinFollowers === undefined &&
      dto.googleProfileViews === undefined
    ) {
      throw new BadRequestException(
        'Debes ingresar al menos una métrica (visitas web, seguidores de LinkedIn o vistas del perfil de Google).',
      );
    }
    const period = this.normalizePeriod(dto.period);
    const values = {
      webVisits: dto.webVisits ?? null,
      linkedinFollowers: dto.linkedinFollowers ?? null,
      googleProfileViews: dto.googleProfileViews ?? null,
      notes: dto.notes ?? null,
    };

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.presenceSnapshot.upsert({
        where: { companyId_period: { companyId, period } },
        update: values, // FULL-REPLACE — unsent metrics become null (see doc above).
        create: { companyId, createdBy: userId, period, ...values },
      });
    });
  }

  /* MKT-008 — range list for charting, period ASC. Defaults to the last 12 months
     (inclusive of the current month) when no range is given. `from`/`to` accept the same
     'YYYY-MM'(-DD) format and are normalized to their month's first UTC day. */
  async findRange(companyId: string, from?: string, to?: string) {
    if (from && !PERIOD_RE.test(from)) {
      throw new BadRequestException('El parámetro from debe tener el formato YYYY-MM.');
    }
    if (to && !PERIOD_RE.test(to)) {
      throw new BadRequestException('El parámetro to debe tener el formato YYYY-MM.');
    }
    const now = new Date();
    const currentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const start = from
      ? this.normalizePeriod(from)
      : new Date(Date.UTC(currentMonth.getUTCFullYear(), currentMonth.getUTCMonth() - 11, 1));
    const end = to ? this.normalizePeriod(to) : currentMonth;

    const where: Prisma.PresenceSnapshotWhereInput = {
      companyId,
      period: { gte: start, lte: end },
    };
    return this.prisma.presenceSnapshot.findMany({ where, orderBy: [{ period: 'asc' }] });
  }
}
