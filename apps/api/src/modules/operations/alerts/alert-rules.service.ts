import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AlertSeverity, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { CompanyAlertSettingsService } from './company-alert-settings.service';
import { CreateAlertRuleDto } from './dto/create-alert-rule.dto';
import { FilterAlertRulesDto } from './dto/filter-alert-rules.dto';
import { UpdateAlertRuleDto } from './dto/update-alert-rule.dto';

interface ResolvedRule {
  /* Stable id — UUID for stored rules, synthetic `default:<daysBefore>:<severity>`
     for dynamic defaults so the UI can key on it without collisions. */
  id: string;
  isDefault: boolean;
  daysBeforeExpiration: number;
  severity: AlertSeverity;
  channels: { inApp: boolean; email: boolean };
  targetRoles: string[];
  notifyAssignedUser: boolean;
  notifyOperationalSupervisor: boolean;
  escalateAfterDays: number | null;
  escalateToRoles: string[];
  /* `null` indicates a dynamic default that hasn't been overridden — the
     caller can show "(predeterminada)" labels and offer "Personalizar". */
  ruleId: string | null;
  name: string;
  description: string | null;
}

@Injectable()
export class AlertRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
    private readonly settingsService: CompanyAlertSettingsService,
  ) {}

  async create(companyId: string, userId: string, dto: CreateAlertRuleDto) {
    if (dto.documentTypeId) {
      const exists = await this.prisma.operationalDocumentType.findFirst({
        where: { id: dto.documentTypeId, companyId },
        select: { id: true },
      });
      if (!exists) {
        throw new BadRequestException('El tipo de documento no existe en esta empresa.');
      }
    }
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.alertRule.create({
        data: {
          companyId,
          documentTypeId: dto.documentTypeId ?? null,
          name: dto.name,
          isActive: dto.isActive ?? true,
          daysBeforeExpiration: dto.daysBeforeExpiration,
          severity: dto.severity,
          channels: (dto.channels ?? {
            inApp: true,
            email: false,
          }) as unknown as Prisma.InputJsonValue,
          targetRoles: dto.targetRoles ?? [],
          notifyAssignedUser: dto.notifyAssignedUser ?? true,
          notifyOperationalSupervisor: dto.notifyOperationalSupervisor ?? false,
          escalateAfterDays: dto.escalateAfterDays ?? null,
          escalateToRoles: dto.escalateToRoles ?? [],
          description: dto.description ?? null,
          createdBy: userId,
        },
        include: {
          documentType: { select: { id: true, name: true, code: true, category: true } },
        },
      });
    });
  }

  async findAll(companyId: string, filters: FilterAlertRulesDto) {
    const where: Prisma.AlertRuleWhereInput = { companyId };
    if (filters.documentTypeId) where.documentTypeId = filters.documentTypeId;
    if (filters.isActive !== undefined) where.isActive = filters.isActive;
    if (filters.severity) where.severity = filters.severity;
    return this.prisma.alertRule.findMany({
      where,
      include: {
        documentType: { select: { id: true, name: true, code: true, category: true } },
      },
      /* Longest-threshold rules first so the UI mirrors the chronological
         order of how alerts will fire as the expiration date approaches. */
      orderBy: [{ daysBeforeExpiration: 'desc' }, { severity: 'desc' }],
    });
  }

  async findOne(id: string, companyId: string) {
    const row = await this.prisma.alertRule.findFirst({
      where: { id, companyId },
      include: {
        documentType: { select: { id: true, name: true, code: true, category: true } },
      },
    });
    if (!row) throw new NotFoundException('Regla de alerta no encontrada.');
    return row;
  }

  async update(id: string, companyId: string, userId: string, dto: UpdateAlertRuleDto) {
    const existing = await this.prisma.alertRule.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Regla de alerta no encontrada.');

    if (dto.documentTypeId !== undefined && dto.documentTypeId !== null) {
      const dt = await this.prisma.operationalDocumentType.findFirst({
        where: { id: dto.documentTypeId, companyId },
        select: { id: true },
      });
      if (!dt) {
        throw new BadRequestException('El tipo de documento no existe en esta empresa.');
      }
    }

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.alertRule.update({
        where: { id },
        data: {
          ...(dto.documentTypeId !== undefined ? { documentTypeId: dto.documentTypeId } : {}),
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.daysBeforeExpiration !== undefined
            ? { daysBeforeExpiration: dto.daysBeforeExpiration }
            : {}),
          ...(dto.severity !== undefined ? { severity: dto.severity } : {}),
          ...(dto.channels !== undefined
            ? { channels: dto.channels as unknown as Prisma.InputJsonValue }
            : {}),
          ...(dto.targetRoles !== undefined ? { targetRoles: dto.targetRoles } : {}),
          ...(dto.notifyAssignedUser !== undefined
            ? { notifyAssignedUser: dto.notifyAssignedUser }
            : {}),
          ...(dto.notifyOperationalSupervisor !== undefined
            ? { notifyOperationalSupervisor: dto.notifyOperationalSupervisor }
            : {}),
          ...(dto.escalateAfterDays !== undefined
            ? { escalateAfterDays: dto.escalateAfterDays }
            : {}),
          ...(dto.escalateToRoles !== undefined ? { escalateToRoles: dto.escalateToRoles } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
        },
        include: {
          documentType: { select: { id: true, name: true, code: true, category: true } },
        },
      });
    });
  }

  async remove(id: string, companyId: string, userId: string) {
    const existing = await this.prisma.alertRule.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Regla de alerta no encontrada.');
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      await tx.alertRule.delete({ where: { id } });
      return { id };
    });
  }

  /* OPS-018 — merges custom AlertRule rows with the dynamic defaults
     derived from the document type's own alertDaysBefore /
     criticalAlertDaysBefore / blocksOperation properties (or the
     company-wide settings as a final fallback). The OPS-019 scheduler
     will call this for each (asset, documentType) when it walks
     expiring documents. */
  async resolveRulesForDocumentType(
    companyId: string,
    documentTypeId: string,
  ): Promise<ResolvedRule[]> {
    const documentType = await this.prisma.operationalDocumentType.findFirst({
      where: { id: documentTypeId, companyId },
      select: {
        id: true,
        alertDaysBefore: true,
        criticalAlertDaysBefore: true,
        hasExpiration: true,
        blocksOperation: true,
      },
    });
    if (!documentType) {
      throw new NotFoundException('Tipo de documento no encontrado.');
    }

    const [settings, custom] = await Promise.all([
      this.settingsService.getOrCreate(companyId, null),
      this.prisma.alertRule.findMany({
        where: {
          companyId,
          isActive: true,
          OR: [{ documentTypeId }, { documentTypeId: null }],
        },
      }),
    ]);

    /* Build the list of dynamic defaults — only for types that expire,
       since alerts on non-expiring docs make no sense. */
    const defaults: ResolvedRule[] = [];
    if (documentType.hasExpiration) {
      const warningDays =
        documentType.alertDaysBefore > 0
          ? documentType.alertDaysBefore
          : settings.defaultDaysBefore;
      const criticalDays =
        documentType.criticalAlertDaysBefore > 0
          ? documentType.criticalAlertDaysBefore
          : settings.defaultCriticalDaysBefore;

      defaults.push(this.synthDefault(warningDays, 'WARNING'));
      if (criticalDays !== warningDays) {
        defaults.push(this.synthDefault(criticalDays, 'CRITICAL'));
      }
      if (documentType.blocksOperation) {
        defaults.push(this.synthDefault(settings.defaultBlockingDaysBefore, 'BLOCKING'));
      }
    }

    /* Custom rules win over defaults at the same (daysBeforeExpiration,
       severity) — we key on both because two defaults can sit at the
       same threshold (WARNING+CRITICAL share a day count when admins
       collapse the two). Document-type-specific overrides also win over
       global ones. */
    const ruleMap = new Map<string, ResolvedRule>();
    const keyOf = (days: number, sev: AlertSeverity) => `${days}::${sev}`;

    for (const d of defaults) {
      ruleMap.set(keyOf(d.daysBeforeExpiration, d.severity), d);
    }

    /* Apply globals first so type-specific overrides land on top. */
    const globals = custom.filter((r) => r.documentTypeId === null);
    const specifics = custom.filter((r) => r.documentTypeId === documentTypeId);
    for (const r of [...globals, ...specifics]) {
      const channels = (r.channels ?? { inApp: true, email: false }) as {
        inApp?: boolean;
        email?: boolean;
      };
      ruleMap.set(keyOf(r.daysBeforeExpiration, r.severity), {
        id: r.id,
        ruleId: r.id,
        isDefault: false,
        daysBeforeExpiration: r.daysBeforeExpiration,
        severity: r.severity,
        channels: { inApp: channels.inApp ?? true, email: channels.email ?? false },
        targetRoles: r.targetRoles,
        notifyAssignedUser: r.notifyAssignedUser,
        notifyOperationalSupervisor: r.notifyOperationalSupervisor,
        escalateAfterDays: r.escalateAfterDays,
        escalateToRoles: r.escalateToRoles,
        name: r.name,
        description: r.description,
      });
    }

    return Array.from(ruleMap.values()).sort((a, b) => {
      if (a.daysBeforeExpiration !== b.daysBeforeExpiration) {
        /* Longest threshold first — the alert-fires-soonest-first ordering
           also matches how the scheduler walks rules. */
        return b.daysBeforeExpiration - a.daysBeforeExpiration;
      }
      return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    });
  }

  private synthDefault(daysBefore: number, severity: AlertSeverity): ResolvedRule {
    return {
      id: `default:${daysBefore}:${severity}`,
      ruleId: null,
      isDefault: true,
      daysBeforeExpiration: daysBefore,
      severity,
      channels: { inApp: true, email: false },
      /* Sensible default audience: ADMIN/MANAGER for warnings, escalate
         to ADMIN-only for blocking. Operators can override via custom
         rules. */
      targetRoles: severity === 'BLOCKING' ? ['ADMIN'] : ['ADMIN', 'MANAGER'],
      notifyAssignedUser: severity !== 'INFO',
      notifyOperationalSupervisor: severity === 'CRITICAL' || severity === 'BLOCKING',
      escalateAfterDays: null,
      escalateToRoles: [],
      name: DEFAULT_NAMES[severity],
      description: 'Regla predeterminada generada por el sistema.',
    };
  }
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  BLOCKING: 0,
  CRITICAL: 1,
  WARNING: 2,
  INFO: 3,
};

const DEFAULT_NAMES: Record<AlertSeverity, string> = {
  INFO: 'Aviso predeterminado',
  WARNING: 'Alerta de vencimiento próximo',
  CRITICAL: 'Alerta crítica de vencimiento',
  BLOCKING: 'Alerta de bloqueo operacional',
};
