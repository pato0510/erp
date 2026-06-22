import { Injectable, NotFoundException } from '@nestjs/common';
import { AvailabilityStatus, CertificationStatus, CertificationType } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateAvailabilityDto } from './dto/create-availability.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';
import { ServiceRequirementsService } from './service-requirements.service';
import { deriveCertStatus } from './rrhh.helpers';

/** Normalises any Date/ISO string to a UTC midnight Date (matches @db.Date). */
function toDateOnly(input: string | Date): Date {
  const d = new Date(input);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly serviceReqs: ServiceRequirementsService,
  ) {}

  /** Flat availability rows with optional from/to/cargo/area/status filters. */
  async findAll(
    companyId: string,
    filters: {
      from?: string;
      to?: string;
      cargo?: string;
      area?: string;
      status?: AvailabilityStatus;
    } = {},
  ) {
    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (filters.from) dateFilter.gte = toDateOnly(filters.from);
    if (filters.to) dateFilter.lte = toDateOnly(filters.to);

    const rows = await this.prisma.employeeAvailability.findMany({
      where: {
        companyId,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.from || filters.to ? { date: dateFilter } : {}),
        ...(filters.cargo || filters.area
          ? {
              employee: {
                ...(filters.cargo ? { cargo: filters.cargo } : {}),
                ...(filters.area ? { area: filters.area } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ date: 'asc' }],
      include: {
        employee: { select: { id: true, nombres: true, apellidos: true, cargo: true, area: true } },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      employeeId: r.employeeId,
      employeeName: `${r.employee.nombres} ${r.employee.apellidos}`.trim(),
      cargo: r.employee.cargo,
      area: r.employee.area,
      date: r.date,
      endDate: r.endDate,
      status: r.status,
      notes: r.notes,
    }));
  }

  /** Per-employee calendar: one entry per employee with their day rows in range. */
  async calendar(companyId: string, from?: string, to?: string) {
    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (from) dateFilter.gte = toDateOnly(from);
    if (to) dateFilter.lte = toDateOnly(to);

    const employees = await this.prisma.employee.findMany({
      where: { companyId },
      orderBy: [{ apellidos: 'asc' }, { nombres: 'asc' }],
      select: {
        id: true,
        nombres: true,
        apellidos: true,
        cargo: true,
        area: true,
        availability: {
          where: from || to ? { date: dateFilter } : undefined,
          orderBy: { date: 'asc' },
          select: { date: true, status: true, notes: true },
        },
      },
    });

    return employees.map((e) => ({
      employeeId: e.id,
      employeeName: `${e.nombres} ${e.apellidos}`.trim(),
      cargo: e.cargo,
      area: e.area,
      items: e.availability.map((a) => ({
        date: a.date,
        status: a.status,
        notes: a.notes,
      })),
    }));
  }

  async create(companyId: string, dto: CreateAvailabilityDto) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, companyId },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException('Trabajador no encontrado');

    return this.prisma.employeeAvailability.create({
      data: {
        companyId,
        employeeId: dto.employeeId,
        date: toDateOnly(dto.date),
        endDate: dto.endDate ? toDateOnly(dto.endDate) : null,
        status: dto.status ?? undefined,
        notes: dto.notes ?? null,
      },
    });
  }

  async update(id: string, companyId: string, dto: UpdateAvailabilityDto) {
    const existing = await this.prisma.employeeAvailability.findFirst({ where: { id, companyId } });
    if (!existing) throw new NotFoundException('Disponibilidad no encontrada');
    return this.prisma.employeeAvailability.update({
      where: { id },
      data: {
        date: dto.date !== undefined ? toDateOnly(dto.date) : undefined,
        endDate:
          dto.endDate !== undefined ? (dto.endDate ? toDateOnly(dto.endDate) : null) : undefined,
        status: dto.status ?? undefined,
        notes: dto.notes ?? undefined,
      },
    });
  }

  async remove(id: string, companyId: string) {
    const existing = await this.prisma.employeeAvailability.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Disponibilidad no encontrada');
    await this.prisma.employeeAvailability.delete({ where: { id } });
    return { id, deleted: true };
  }

  /**
   * READ-ONLY resolver consumed by the Comercial module. Given a service name (+
   * optional date, default today):
   *  - resolve the ServiceRequirement by case-insensitive name → reqType
   *  - qualified = ACTIVO employees holding a VIGENTE cert of type reqType (on the
   *    target date). If reqType is null (or no requirement) → all ACTIVO qualify.
   *  - available = qualified employees with NO availability row on the date, or a
   *    row whose status is DISPONIBLE. Any other status = NOT available.
   */
  async forService(companyId: string, service: string, dateInput?: string) {
    const date = toDateOnly(dateInput ?? new Date().toISOString());

    const requirement = await this.serviceReqs.findByServiceName(companyId, service);
    const reqType: CertificationType | null = requirement?.requiredCertType ?? null;

    // ACTIVO employees, with the certs (filtered to reqType if any) + the day's
    // availability row, fetched in one go.
    const employees = await this.prisma.employee.findMany({
      where: { companyId, estado: 'ACTIVO' },
      select: {
        id: true,
        nombres: true,
        apellidos: true,
        cargo: true,
        certifications: reqType
          ? { where: { type: reqType }, select: { expiryDate: true } }
          : false,
        availability: { where: { date }, select: { status: true } },
      },
    });

    const staff: {
      name: string;
      role: string;
      certStatus: CertificationStatus | null;
      availabilityStatus: AvailabilityStatus;
      available: boolean;
    }[] = [];

    let qualifiedCount = 0;
    let availableCount = 0;

    for (const e of employees) {
      // Cert gate.
      let certStatus: CertificationStatus | null = null;
      let qualifies: boolean;
      if (reqType) {
        const certs = (e.certifications ?? []) as { expiryDate: Date | null }[];
        // Best (latest-expiring) cert of the required type, status derived at `date`.
        let best: CertificationStatus | null = null;
        for (const c of certs) {
          const st = deriveCertStatus(c.expiryDate, date);
          if (st === CertificationStatus.VIGENTE) {
            best = CertificationStatus.VIGENTE;
            break;
          }
          if (best === null) best = st;
        }
        certStatus = best;
        qualifies = best === CertificationStatus.VIGENTE;
      } else {
        // No specific cert required: every ACTIVO employee qualifies.
        qualifies = true;
      }

      if (!qualifies) continue;
      qualifiedCount++;

      // Availability gate: absence of a row = DISPONIBLE.
      const row = e.availability[0];
      const availabilityStatus = row?.status ?? AvailabilityStatus.DISPONIBLE;
      const isAvailable = availabilityStatus === AvailabilityStatus.DISPONIBLE;
      if (isAvailable) availableCount++;

      staff.push({
        name: `${e.nombres} ${e.apellidos}`.trim(),
        role: e.cargo,
        certStatus,
        availabilityStatus,
        available: isAvailable,
      });
    }

    // Available staff first, then by name.
    staff.sort((a, b) => {
      if (a.available !== b.available) return a.available ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return {
      service,
      requiredCertType: reqType,
      requiresDrone: requirement?.requiresDrone ?? false,
      qualified: qualifiedCount,
      available: availableCount,
      canStaff: availableCount > 0,
      date,
      staff,
    };
  }

  /** Snapshot of today's availability for the ACTIVO pool — used by the dashboard. */
  async todaySnapshot(companyId: string) {
    const today = toDateOnly(new Date().toISOString());
    const employees = await this.prisma.employee.findMany({
      where: { companyId, estado: 'ACTIVO' },
      select: { id: true, availability: { where: { date: today }, select: { status: true } } },
    });
    let disponibles = 0;
    for (const e of employees) {
      const status = e.availability[0]?.status ?? AvailabilityStatus.DISPONIBLE;
      if (status === AvailabilityStatus.DISPONIBLE) disponibles++;
    }
    return {
      dotacionActiva: employees.length,
      disponiblesHoy: disponibles,
      noDisponiblesHoy: employees.length - disponibles,
    };
  }
}

// Re-exported for any direct date helpers a screen agent might want to mirror.
export { toDateOnly, sameDay };
