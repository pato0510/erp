import { CertificationStatus, EmployeeDocumentStatus } from '@prisma/client';
import type { PayrollParams, TaxBracket } from './payroll/payroll.calculator';

/** Days from `now` until `date` (positive = future, negative = past). */
export function diasRestantes(date: Date | null | undefined, now = new Date()): number | null {
  if (!date) return null;
  const a = new Date(date);
  a.setHours(0, 0, 0, 0);
  const b = new Date(now);
  b.setHours(0, 0, 0, 0);
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

const POR_VENCER_THRESHOLD_DAYS = 30;

/**
 * Derives the live document estado from its expiry date. A document with no
 * expiry stays VIGENTE (or DRAFT if it was never effectively issued). The stored
 * `estado` column is a snapshot; this is the source of truth at read time.
 */
export function deriveDocumentStatus(
  fechaVencimiento: Date | null | undefined,
  stored?: EmployeeDocumentStatus,
): EmployeeDocumentStatus {
  if (stored === EmployeeDocumentStatus.DRAFT) return EmployeeDocumentStatus.DRAFT;
  if (!fechaVencimiento) return EmployeeDocumentStatus.VIGENTE;
  const dias = diasRestantes(fechaVencimiento);
  if (dias === null) return EmployeeDocumentStatus.VIGENTE;
  if (dias < 0) return EmployeeDocumentStatus.VENCIDO;
  if (dias <= POR_VENCER_THRESHOLD_DAYS) return EmployeeDocumentStatus.POR_VENCER;
  return EmployeeDocumentStatus.VIGENTE;
}

/**
 * Derives the live certification status from its expiry date, relative to `at`
 * (defaults to today). VIGENTE if >30d out, POR_VENCER if within 30d, VENCIDA if
 * past. A cert with no expiry is treated as permanently VIGENTE. Mirrors the
 * employee-document derivation so the same status vocabulary applies.
 */
export function deriveCertStatus(
  expiryDate: Date | null | undefined,
  at: Date = new Date(),
): CertificationStatus {
  if (!expiryDate) return CertificationStatus.VIGENTE;
  const dias = diasRestantes(expiryDate, at);
  if (dias === null) return CertificationStatus.VIGENTE;
  if (dias < 0) return CertificationStatus.VENCIDA;
  if (dias <= POR_VENCER_THRESHOLD_DAYS) return CertificationStatus.POR_VENCER;
  return CertificationStatus.VIGENTE;
}

/** Maps a Prisma PayrollParameter row (Decimals/JSON) into the calculator shape. */
export function toPayrollParams(row: {
  ufValue: unknown;
  utmValue: unknown;
  topeImponibleUf: unknown;
  topeCesantiaUf: unknown;
  saludRate: unknown;
  cesantiaRateTrabajador: unknown;
  afpRates: unknown;
  taxBrackets: unknown;
}): PayrollParams {
  return {
    ufValue: Number(row.ufValue),
    utmValue: Number(row.utmValue),
    topeImponibleUf: Number(row.topeImponibleUf),
    topeCesantiaUf: Number(row.topeCesantiaUf),
    saludRate: Number(row.saludRate),
    cesantiaRateTrabajador: Number(row.cesantiaRateTrabajador),
    afpRates: (row.afpRates ?? {}) as Record<string, number>,
    taxBrackets: (row.taxBrackets ?? []) as TaxBracket[],
  };
}
