import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { UpdateAlertSettingsDto } from './dto/update-alert-settings.dto';

/* Sentinel used when we don't have a real userId on hand for the initial
   row creation (e.g. when the AlertRulesService.resolve flow lazily
   creates settings for a brand-new company). The audit trigger can still
   record this — we just never actually mutate the row in that path, so
   the value rarely matters. */
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

@Injectable()
export class CompanyAlertSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  /* Idempotent: reads the singleton row for this company, creating it
     with documented defaults if missing. The userId is only used for the
     initial create and the audit trigger; reads don't write. */
  async getOrCreate(companyId: string, userId: string | null) {
    const existing = await this.prisma.companyAlertSettings.findUnique({
      where: { companyId },
    });
    if (existing) return existing;

    const effectiveUser = userId ?? SYSTEM_USER_ID;
    return this.rlsService.executeWithRls(companyId, effectiveUser, async (tx) => {
      /* Race-safe: another request might have inserted the row between
         the read above and this write. The unique constraint on
         companyId guarantees idempotence — we re-read on conflict. */
      try {
        return await tx.companyAlertSettings.create({
          data: {
            companyId,
            updatedBy: effectiveUser,
          },
        });
      } catch {
        return tx.companyAlertSettings.findUniqueOrThrow({ where: { companyId } });
      }
    });
  }

  async update(companyId: string, userId: string, dto: UpdateAlertSettingsDto) {
    /* Ensure the row exists before we update so the API stays simple
       (callers don't need to call getOrCreate first). */
    await this.getOrCreate(companyId, userId);
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.companyAlertSettings.update({
        where: { companyId },
        data: {
          ...(dto.defaultDaysBefore !== undefined
            ? { defaultDaysBefore: dto.defaultDaysBefore }
            : {}),
          ...(dto.defaultCriticalDaysBefore !== undefined
            ? { defaultCriticalDaysBefore: dto.defaultCriticalDaysBefore }
            : {}),
          ...(dto.defaultBlockingDaysBefore !== undefined
            ? { defaultBlockingDaysBefore: dto.defaultBlockingDaysBefore }
            : {}),
          ...(dto.enableAutoBlocking !== undefined
            ? { enableAutoBlocking: dto.enableAutoBlocking }
            : {}),
          ...(dto.enableEmailNotifications !== undefined
            ? { enableEmailNotifications: dto.enableEmailNotifications }
            : {}),
          ...(dto.defaultEscalationDays !== undefined
            ? { defaultEscalationDays: dto.defaultEscalationDays }
            : {}),
          updatedBy: userId,
        },
      });
    });
  }
}
