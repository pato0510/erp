import { Injectable } from '@nestjs/common';
import { EmployeeStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/* CAL-006 — the ONE cross-module contract of the calendar's V1 (Part 1 §3). RRHH exposes a
 * minimal, PII-safe birthday read; Actividades consumes it to paint birthday chips visible to
 * every role on the company calendar.
 *
 * FOUNDER-SIGNED EXPOSURE — decision (d), 2026-07-15: the name + day/month of ACTIVE employees
 * is deliberately visible to ALL roles through this calendar, including ANALYST/VIEWER who
 * cannot read employees anywhere else in RRHH. The calendar exposes exactly this and NOTHING
 * more — NEVER the year, NEVER the age, NEVER any other Employee field. The privacy line is
 * STRUCTURAL, not a filter: BirthdayEntry cannot carry what it must not (see its shape below —
 * there is no `year`, no `birthDate`, no `status`, no `rut`). `employeeId` is a stable render
 * key only; no Actividades surface may link or resolve it. */

export interface BirthdayEntry {
  employeeId: string; // stable render key ONLY — never linked/resolved by any Actividades surface
  fullName: string;
  day: number; // 1..31
  month: number; // 1..12
  // NO year. NO age. NO birthDate. NO status. NO area. The absence is the privacy guarantee.
}

@Injectable()
export class BirthdayReadService {
  constructor(private readonly prisma: PrismaService) {}

  /** Birthdays falling in `month` (1..12) for the company. Derives live from Employee.birthDate:
   *  ACTIVO only; null birthDate simply does not appear (the field is nullable — no error, no
   *  phantom row). day/month are read from the UTC parts of the @db.Date; the year is read for
   *  NOTHING. In-memory month filter after fetching active-with-birthdate is fine at AGS scale
   *  (tens of employees) — no raw SQL. */
  async listForMonth(companyId: string, month: number): Promise<BirthdayEntry[]> {
    const employees = await this.prisma.employee.findMany({
      where: { companyId, status: EmployeeStatus.ACTIVO, birthDate: { not: null } },
      select: { id: true, fullName: true, birthDate: true },
    });

    const out: BirthdayEntry[] = [];
    for (const e of employees) {
      if (!e.birthDate) continue; // defensive; the where already excludes null
      const m = e.birthDate.getUTCMonth() + 1; // UTC parts of @db.Date
      if (m !== month) continue;
      out.push({
        employeeId: e.id,
        fullName: e.fullName,
        day: e.birthDate.getUTCDate(),
        month: m,
        // birthDate.getUTCFullYear() is deliberately NEVER read.
      });
    }
    return out;
  }
}
