import { Injectable } from '@nestjs/common';
import { ServiceOrderStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/* CAL-016 — the narrowed contract the master calendar consumes for the two Operaciones
 * collections (the signed exposure matrix, 2026-07-23). Both shapes are STRUCTURALLY money-free:
 * a servicio carries a label + range + ops status and NOTHING else — NEVER netAmount/taxAmount/
 * totalAmount/currency (the matrix: "servicios NEVER amounts"). The absence is the guarantee,
 * exactly as BirthdayEntry cannot carry a year. `status` is the Prisma enum (RECIBIDA·
 * EN_EJECUCION·COMPLETADA·CANCELADA) — the OPS vocabulary travels verbatim; the master never maps
 * it to ActivityStatus (the vocabulary-coexistence doctrine). */

export interface ServicioCalendarEntry {
  serviceOrderId: string; // stable render key + the id the ability-shaped link resolves
  label: string; // "cliente — servicio" identifying snapshot
  executionStart: string; // ISO of the @db.Date (UTC midnight)
  executionEnd: string; // ISO of the @db.Date (UTC midnight)
  status: ServiceOrderStatus; // ops vocabulary, verbatim — NO amounts anywhere in this shape
}

export interface VencimientoCalendarEntry {
  id: string; // the DocumentRecord id (stable key + link target)
  label: string; // "tipo de documento — código de activo"
  date: string; // ISO of the expiration @db.Date
}

@Injectable()
export class OpsCalendarReadService {
  constructor(private readonly prisma: PrismaService) {}

  /** CAL-016 — service orders whose EXECUTION WINDOW intersects [rangeStart, rangeEnd]. Only orders
   *  with BOTH dates set reach the calendar: `executionStart NOT NULL AND executionEnd NOT NULL`
   *  (the CAL-015 "Sin fechas — no aparece en el calendario maestro" hint, now law). Interval
   *  overlap = starts on/before the window end AND ends on/after the window start. Raw rows,
   *  narrowed to the money-free shape — the SELECT never even reads an amount column. */
  async listServiciosForRange(
    companyId: string,
    rangeStart: Date,
    rangeEnd: Date,
  ): Promise<ServicioCalendarEntry[]> {
    const rows = await this.prisma.serviceOrder.findMany({
      where: {
        companyId,
        // BOTH-NOT-NULL + interval overlap, expressed per-column so the NOT-NULL rides along.
        executionStart: { not: null, lte: rangeEnd },
        executionEnd: { not: null, gte: rangeStart },
      },
      select: {
        id: true,
        clientName: true,
        title: true,
        status: true,
        executionStart: true,
        executionEnd: true,
        // NO netAmount/taxAmount/totalAmount/currency — the money never leaves Operaciones.
      },
      orderBy: [{ executionStart: 'asc' }, { createdAt: 'desc' }],
    });
    // flatMap + guard narrows Date|null → Date (the where already excludes nulls) with no assertion.
    return rows.flatMap((r) => {
      if (!r.executionStart || !r.executionEnd) return [];
      return [
        {
          serviceOrderId: r.id,
          label: `${r.clientName} — ${r.title}`,
          executionStart: r.executionStart.toISOString(),
          executionEnd: r.executionEnd.toISOString(),
          status: r.status,
        },
      ];
    });
  }

  /** CAL-016 — the DOCUMENT-expiration events (the "vencimientos (docs)" matrix row ONLY — permits/
   *  PT/exceptions/procedures are NOT in this collection). This REPLICATES, byte-for-byte, the
   *  document slice of the ops calendar aggregator so the master shows THE SAME SET the ops
   *  calendar shows: OperationsCalendarService.fetchDocumentExpirations
   *  (operations-calendar.service.ts:211-282) — the WHERE (isActive + APPROVED + not-replaced +
   *  expirationDate in range, lines 217-224) and the title `${documentType.name} — ${asset.code}`
   *  (line 263) and date = expirationDate (line 264). Severity/metadata/linkPath are dropped — the
   *  narrowed shape is label + date only. */
  async listVencimientosForRange(
    companyId: string,
    rangeStart: Date,
    rangeEnd: Date,
  ): Promise<VencimientoCalendarEntry[]> {
    const rows = await this.prisma.documentRecord.findMany({
      where: {
        companyId,
        isActive: true,
        status: 'APPROVED',
        replacedByDocumentId: null,
        expirationDate: { gte: rangeStart, lte: rangeEnd },
      },
      select: {
        id: true,
        expirationDate: true,
        asset: { select: { code: true } },
        documentType: { select: { name: true } },
      },
      orderBy: { expirationDate: 'asc' },
    });
    return rows.flatMap((r) => {
      if (!r.expirationDate) return []; // the where already excludes nulls — guard, not assertion
      return [
        {
          id: r.id,
          label: `${r.documentType.name} — ${r.asset.code}`,
          date: r.expirationDate.toISOString(),
        },
      ];
    });
  }
}
