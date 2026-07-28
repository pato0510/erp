import { Injectable } from '@nestjs/common';
import { EmployeeStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/* HSEC-003 — FOUNDER-SIGNED EXPOSURE (2026-07-27, PART1 decision 4): RRHH roster-lite → HSEC.
 * The contract is STRUCTURALLY two keys — { employeeId, fullName } — and can never carry
 * rut/area/status/email: no other Employee column is ever selected, and the return shapes have
 * no slot for one (the AusenciaCalendarEntry discipline — BirthdayEntry cannot carry a year;
 * AusenciaCalendarEntry cannot carry a motivo; EmployeeLiteEntry cannot carry a rut).
 * EXACTLY two methods:
 *   - listActiveLite: pickers — ACTIVO only (you can only involve current workers going
 *     forward).
 *   - resolveNamesByIds: display — ANY status (a DESVINCULADO afectado keeps their name in
 *     old records; history never goes blank). Company-scoped: foreign ids silently drop.
 * Consumed by HSEC (roster + afectados). Widening this contract requires a NEW dated founder
 * signature here and in CLAUDE.md. */

export interface EmployeeLiteEntry {
  employeeId: string;
  fullName: string;
  // NO rut. NO area. NO status. NO email. The name is the whole exposure.
}

@Injectable()
export class RrhhEmployeeReadService {
  constructor(private readonly prisma: PrismaService) {}

  /** ACTIVO employees only, ordered by fullName — the picker set (PART1 decision 4a). */
  async listActiveLite(companyId: string): Promise<EmployeeLiteEntry[]> {
    const rows = await this.prisma.employee.findMany({
      where: { companyId, status: EmployeeStatus.ACTIVO },
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true },
    });
    return rows.map((r) => ({ employeeId: r.id, fullName: r.fullName }));
  }

  /** Names for the given ids, ANY employee status (PART1 decision 4b — a DESVINCULADO
   *  afectado keeps their name in history). Company-scoped: ids not belonging to the company
   *  are silently dropped (absence from the result IS the "not yours" signal — never an
   *  error, never a leak). */
  async resolveNamesByIds(companyId: string, ids: string[]): Promise<Record<string, string>> {
    if (ids.length === 0) return {};
    const rows = await this.prisma.employee.findMany({
      where: { companyId, id: { in: ids } },
      select: { id: true, fullName: true },
    });
    return Object.fromEntries(rows.map((r) => [r.id, r.fullName]));
  }
}
