import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { DocTypePreset, RECOMMENDED_PRESETS } from './alert-rule-presets';

@Injectable()
export class AlertRulePresetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  /* OPS-018 — bulk-creates the recommended Chilean rule pack. We match
     document types by code prefix (case-insensitive) so a company that
     named its SOAP type "SOAP-AUTO" still gets the pack. Existing rules
     with the same name+documentTypeId are skipped (no duplicates on
     repeated clicks). */
  async applyRecommendedChileanRules(
    companyId: string,
    userId: string,
  ): Promise<{ created: number; skipped: number; missingTypes: string[] }> {
    const documentTypes = await this.prisma.operationalDocumentType.findMany({
      where: { companyId, isActive: true },
      select: { id: true, code: true },
    });
    const existingRules = await this.prisma.alertRule.findMany({
      where: { companyId },
      select: { name: true, documentTypeId: true },
    });
    const existingKeys = new Set(
      existingRules.map((r) => `${r.documentTypeId ?? 'GLOBAL'}::${r.name.toLowerCase()}`),
    );

    let created = 0;
    let skipped = 0;
    const missingTypes: string[] = [];

    /* Ordered: each preset matches against every document type that
       fits its code-prefix list. We preserve insertion order so the
       resulting Prisma rows share the same ordering as the catalog. */
    for (const preset of RECOMMENDED_PRESETS) {
      const matched = documentTypes.filter((dt) => matchesPreset(dt.code, preset));
      if (matched.length === 0) {
        missingTypes.push(preset.codePrefixes[0]);
        continue;
      }
      for (const dt of matched) {
        for (const rule of preset.rules) {
          const key = `${dt.id}::${rule.name.toLowerCase()}`;
          if (existingKeys.has(key)) {
            skipped++;
            continue;
          }
          await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
            await tx.alertRule.create({
              data: {
                companyId,
                documentTypeId: dt.id,
                name: rule.name,
                isActive: true,
                daysBeforeExpiration: rule.daysBeforeExpiration,
                severity: rule.severity,
                channels: { inApp: true, email: false } as Prisma.InputJsonValue,
                targetRoles: rule.targetRoles,
                notifyAssignedUser: rule.notifyAssignedUser,
                notifyOperationalSupervisor: rule.notifyOperationalSupervisor,
                escalateAfterDays: rule.escalateAfterDays ?? null,
                escalateToRoles: rule.escalateToRoles ?? [],
                description: preset.description,
                createdBy: userId,
              },
            });
          });
          existingKeys.add(key);
          created++;
        }
      }
    }
    return { created, skipped, missingTypes };
  }
}

function matchesPreset(code: string, preset: DocTypePreset): boolean {
  const upper = code.toUpperCase();
  return preset.codePrefixes.some((p) => upper.startsWith(p.toUpperCase()));
}
