import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CertificationCategory, CertificationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { CreateCertificationDto } from './dto/create-certification.dto';
import { UpdateCertificationDto } from './dto/update-certification.dto';

/* The POR_VENCER window — mirrors the HR-004 DEFAULT_ALERT_DAYS_BEFORE so the
   derived status + compliance line up with documents and the reminder cron. */
const ALERT_DAYS_BEFORE = 30;

/* Derived display status: ANULADA wins; otherwise fold the expiry window
   (copy-adapt of the HR-004 deriveStatus). No expiry → VIGENTE. */
export type CertDerivedStatus = 'VIGENTE' | 'POR_VENCER' | 'VENCIDA' | 'ANULADA';

const CERT_INCLUDE = {
  certificationType: { select: { id: true, name: true, category: true, issuingEntity: true } },
  document: { select: { id: true, fileName: true } },
} satisfies Prisma.CertificationInclude;

@Injectable()
export class CertificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  private utcNow(): Date {
    return new Date();
  }

  private utcToday(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  private deriveStatus(
    status: CertificationStatus,
    expiryDate: Date | null,
    now: Date,
  ): CertDerivedStatus {
    if (status === 'ANULADA') return 'ANULADA';
    if (!expiryDate) return 'VIGENTE';
    /* Count days against START-OF-DAY (expiryDate is @db.Date = midnight UTC), so
       the result is day-based regardless of the time-of-day in `now`. This keeps
       derivedStatus consistent with daysUntilExpiry (utcToday) and the day-based
       reminder cron — a cert is VIGENTE/POR_VENCER on its actual expiry day, only
       VENCIDA once the day has passed. */
    const startOfDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const days = Math.floor((expiryDate.getTime() - startOfDay) / 86400000);
    if (days < 0) return 'VENCIDA';
    if (days <= ALERT_DAYS_BEFORE) return 'POR_VENCER';
    return 'VIGENTE';
  }

  private enrich<T extends { status: CertificationStatus; expiryDate: Date | null }>(
    cert: T,
    now = this.utcNow(),
  ) {
    return { ...cert, derivedStatus: this.deriveStatus(cert.status, cert.expiryDate, now) };
  }

  /* Auto-expiry from the type's defaultValidityDays — copy of the HR-004 rule. */
  private resolveExpiry(
    dtoExpiry: string | undefined,
    issueDate: Date | null,
    type: { requiresExpiry: boolean; defaultValidityDays: number | null },
  ): Date | null {
    if (dtoExpiry) return new Date(dtoExpiry);
    if (type.requiresExpiry && issueDate && type.defaultValidityDays) {
      const exp = new Date(issueDate);
      exp.setDate(exp.getDate() + type.defaultValidityDays);
      return exp;
    }
    return null;
  }

  /* Validates employee + type belong to the company (and the documentId, if given,
     belongs to this employee). Returns the type for category/expiry derivation. */
  private async validateRefs(
    companyId: string,
    employeeId: string,
    certificationTypeId: string,
    documentId?: string | null,
  ) {
    const [employee, type] = await Promise.all([
      this.prisma.employee.findFirst({
        where: { id: employeeId, companyId },
        select: { id: true },
      }),
      this.prisma.certificationType.findFirst({
        where: { id: certificationTypeId, companyId },
        select: { id: true, category: true, requiresExpiry: true, defaultValidityDays: true },
      }),
    ]);
    if (!employee) throw new BadRequestException('El trabajador no existe en esta empresa.');
    if (!type) throw new BadRequestException('El tipo de certificación no existe en esta empresa.');
    if (documentId) {
      const doc = await this.prisma.employeeDocument.findFirst({
        where: { id: documentId, companyId, employeeId },
        select: { id: true },
      });
      if (!doc) {
        throw new BadRequestException(
          'El documento vinculado no existe o no pertenece a este trabajador.',
        );
      }
    }
    return type;
  }

  async findAll(
    companyId: string,
    employeeId: string,
    filters: { category?: CertificationCategory; status?: CertDerivedStatus } = {},
  ) {
    if (!employeeId) throw new BadRequestException('employeeId es obligatorio.');
    const rows = await this.prisma.certification.findMany({
      where: { companyId, employeeId, ...(filters.category ? { category: filters.category } : {}) },
      include: CERT_INCLUDE,
      orderBy: [{ category: 'asc' }, { expiryDate: 'asc' }, { createdAt: 'desc' }],
    });
    const now = this.utcNow();
    const enriched = rows.map((r) => this.enrich(r, now));
    /* status is a DERIVED filter (POR_VENCER/VENCIDA aren't persisted). */
    return filters.status ? enriched.filter((r) => r.derivedStatus === filters.status) : enriched;
  }

  async findOne(id: string, companyId: string) {
    const row = await this.prisma.certification.findFirst({
      where: { id, companyId },
      include: { ...CERT_INCLUDE, employee: { select: { id: true, fullName: true } } },
    });
    if (!row) throw new NotFoundException('Certificación no encontrada');
    return this.enrich(row);
  }

  async create(companyId: string, userId: string, dto: CreateCertificationDto) {
    const type = await this.validateRefs(
      companyId,
      dto.employeeId,
      dto.certificationTypeId,
      dto.documentId ?? null,
    );
    const issueDate = dto.issueDate ? new Date(dto.issueDate) : null;
    const expiryDate = this.resolveExpiry(dto.expiryDate, issueDate, type);

    const created = await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.certification.create({
        data: {
          companyId,
          createdBy: userId,
          employeeId: dto.employeeId,
          certificationTypeId: dto.certificationTypeId,
          category: type.category, // denormalised from the type
          issueDate,
          expiryDate,
          status: 'VIGENTE',
          documentId: dto.documentId ?? null,
          clientOrSite: dto.clientOrSite ?? null,
          notes: dto.notes ?? null,
        },
        include: CERT_INCLUDE,
      });
    });
    return this.enrich(created);
  }

  async update(id: string, companyId: string, userId: string, dto: UpdateCertificationDto) {
    const existing = await this.prisma.certification.findFirst({
      where: { id, companyId },
      select: { id: true, employeeId: true },
    });
    if (!existing) throw new NotFoundException('Certificación no encontrada');
    if (dto.documentId) {
      const doc = await this.prisma.employeeDocument.findFirst({
        where: { id: dto.documentId, companyId, employeeId: existing.employeeId },
        select: { id: true },
      });
      if (!doc) {
        throw new BadRequestException(
          'El documento vinculado no existe o no pertenece a este trabajador.',
        );
      }
    }
    /* Only the persisted statuses are accepted (VIGENTE | ANULADA); POR_VENCER /
       VENCIDA are derived, never set directly. */
    if (dto.status && dto.status !== 'VIGENTE' && dto.status !== 'ANULADA') {
      throw new BadRequestException(
        'El estado sólo puede fijarse a VIGENTE o ANULADA (los demás se derivan).',
      );
    }

    const data: Prisma.CertificationUncheckedUpdateInput = { updatedBy: userId };
    if (dto.issueDate !== undefined)
      data.issueDate = dto.issueDate ? new Date(dto.issueDate) : null;
    if (dto.expiryDate !== undefined)
      data.expiryDate = dto.expiryDate ? new Date(dto.expiryDate) : null;
    if (dto.documentId !== undefined) data.documentId = dto.documentId || null;
    if (dto.clientOrSite !== undefined) data.clientOrSite = dto.clientOrSite || null;
    if (dto.notes !== undefined) data.notes = dto.notes || null;
    if (dto.status !== undefined) data.status = dto.status;

    const updated = await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.certification.update({ where: { id }, data, include: CERT_INCLUDE });
    });
    return this.enrich(updated);
  }

  async remove(id: string, companyId: string, userId: string) {
    const existing = await this.prisma.certification.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Certificación no encontrada');
    await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.certification.delete({ where: { id } });
    });
    return { id, deleted: true };
  }

  /* Compliance — required vs present, copy-adapted from the HR-004 folder
     compliance. The required set is the employee's cargo requiredCertTypes
     (HR-002, free-text names). For each required name we look for a held cert
     whose type name matches (case-insensitive) and is NOT VENCIDA/ANULADA. */
  async compliance(companyId: string, employeeId: string) {
    const now = this.utcNow();

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId },
      select: {
        id: true,
        fullName: true,
        jobPosition: { select: { id: true, name: true, requiredCertTypes: true } },
      },
    });
    if (!employee) throw new NotFoundException('Trabajador no encontrado');

    const required = employee.jobPosition?.requiredCertTypes ?? [];
    const held = await this.prisma.certification.findMany({
      where: { companyId, employeeId },
      include: CERT_INCLUDE,
      orderBy: [{ expiryDate: 'desc' }, { createdAt: 'desc' }],
    });
    const heldEnriched = held.map((c) => this.enrich(c, now));

    /* Best held cert per type-name (case-insensitive): prefer a non-VENCIDA/
       ANULADA one; the list is already newest-expiry-first. */
    const norm = (s: string) => s.trim().toLowerCase();
    const bestByName = new Map<string, (typeof heldEnriched)[number]>();
    for (const c of heldEnriched) {
      const key = norm(c.certificationType.name);
      const cur = bestByName.get(key);
      const isUsable = c.derivedStatus !== 'VENCIDA' && c.derivedStatus !== 'ANULADA';
      if (!cur) {
        bestByName.set(key, c);
      } else {
        const curUsable = cur.derivedStatus !== 'VENCIDA' && cur.derivedStatus !== 'ANULADA';
        if (isUsable && !curUsable) bestByName.set(key, c);
      }
    }

    let valid = 0;
    let expiringSoon = 0;
    let expired = 0;
    let missing = 0;

    const requiredCerts = required.map((name) => {
      const held = bestByName.get(norm(name)) ?? null;
      let state: 'VIGENTE' | 'POR_VENCER' | 'VENCIDA' | 'FALTANTE';
      if (!held || held.derivedStatus === 'ANULADA') {
        state = 'FALTANTE';
        missing++;
      } else if (held.derivedStatus === 'VENCIDA') {
        state = 'VENCIDA';
        expired++;
      } else if (held.derivedStatus === 'POR_VENCER') {
        state = 'POR_VENCER';
        expiringSoon++;
      } else {
        state = 'VIGENTE';
        valid++;
      }
      const exp = held?.expiryDate ?? null;
      const daysUntilExpiry = exp
        ? Math.floor((exp.getTime() - this.utcToday().getTime()) / 86400000)
        : null;
      return { certTypeName: name, derivedStatus: state, heldCert: held, daysUntilExpiry };
    });

    /* Held certs whose type-name isn't in the cargo's required list. */
    const requiredNames = new Set(required.map(norm));
    const additionalCerts = heldEnriched.filter(
      (c) => !requiredNames.has(norm(c.certificationType.name)),
    );

    const totalRequired = required.length;
    const compliancePercentage =
      totalRequired === 0 ? 100 : Math.round(((valid + expiringSoon) / totalRequired) * 1000) / 10;

    return {
      employee: { id: employee.id, fullName: employee.fullName },
      jobPosition: employee.jobPosition
        ? { id: employee.jobPosition.id, name: employee.jobPosition.name }
        : null,
      compliance: { totalRequired, valid, expiringSoon, expired, missing, compliancePercentage },
      requiredCerts,
      additionalCerts,
      generatedAt: now.toISOString(),
    };
  }
}
