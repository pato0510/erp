/* HR-010 — CERTIFIED finiquito ESTIMATION (Chile, owner-validated). Pure,
 * dependency-free — the single source of truth for the arithmetic. This is an
 * estimation, NOT the definitive legal finiquito (see DISCLAIMER). It is acotado
 * arithmetic: NO tax, NO recargos, NO AFC modelling in V1.
 *
 * Caps:
 *  - IAS + aviso previo use baseTopada = min(baseMonthly, 90·UF) — the 90-UF cap.
 *  - añosIndemnizables = min(añosServicio, 11) — the 11-year cap.
 *  - feriado proporcional uses the FULL baseMonthly (the 90-UF cap does NOT apply).
 *  - dailyRate convention: baseMonthly / 30 (calendar-day rate), applied to the
 *    pending vacation balance in días hábiles (the owner-stated convention).
 */
import { TerminationCausal } from '@prisma/client';

export const TOPE_UF = 90;
export const ANIOS_CAP = 11;

export const DISCLAIMER =
  'Estimación referencial. No reemplaza el cálculo formal del finiquito; la causal definitiva, recargos judiciales y cláusulas pactadas pueden alterar el monto.';

/* Causales that grant indemnización por años de servicio + aviso previo
   (Art. 161 — necesidades de la empresa / desahucio del empleador). */
const IAS_CAUSALES: TerminationCausal[] = ['NECESIDADES_EMPRESA', 'DESAHUCIO_EMPLEADOR'];

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/* Add `m` months to a UTC date, clamping to the last day of the target month
   (Jan 31 + 1 month → Feb 28/29). Used to anchor the 6-month fraction test. */
function addMonthsUtc(d: Date, m: number): Date {
  const day = d.getUTCDate();
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + m, 1));
  const lastDay = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  first.setUTCDate(Math.min(day, lastDay));
  return first;
}

/* Completed years of service with the legal rounding rule: a remaining fraction
   STRICTLY greater than 6 months ("fracción superior a seis meses") counts as a
   full year. DAY-PRECISE: 6 months + extra days (e.g. 4y6m20d → 5) bumps, but an
   EXACT 6-month boundary does not (4y6m → 4; 4y7m → 5; 4y5m → 4; exactly 5y → 5).
   The fraction test anchors on hire + (fullYears·12 + 6) months and asks whether
   the termination date strictly exceeds it — robust across month/day edges
   (including the month-decrement case a naive day-of-month compare would miss). */
export function computeAniosServicio(hireDate: Date, terminationDate: Date): number {
  const hire = startOfUtcDay(hireDate);
  const term = startOfUtcDay(terminationDate);
  if (term.getTime() <= hire.getTime()) return 0;

  let totalMonths =
    (term.getUTCFullYear() - hire.getUTCFullYear()) * 12 +
    (term.getUTCMonth() - hire.getUTCMonth());
  /* If the day-of-month hasn't been reached, the current month isn't complete. */
  if (term.getUTCDate() < hire.getUTCDate()) totalMonths -= 1;
  if (totalMonths < 0) totalMonths = 0;

  const fullYears = Math.floor(totalMonths / 12);
  /* Trailing fraction > 6 months iff term is strictly past the 6-month anchor. */
  const sixMonthAnchor = addMonthsUtc(hire, fullYears * 12 + 6);
  return fullYears + (term.getTime() > sixMonthAnchor.getTime() ? 1 : 0);
}

export interface FiniquitoInput {
  causal: TerminationCausal;
  ufValue: number;
  baseMonthly: number;
  hireDate: Date;
  terminationDate: Date;
  avisoPrevioDado: boolean; // was 30-day notice given?
  feriadoDias: number; // pending vacation balance, días hábiles (HR-011 saldo)
}

export interface FiniquitoBreakdown {
  causal: TerminationCausal;
  // inputs echoed back
  ufValue: number;
  baseMonthly: number;
  avisoPrevioDado: boolean;
  hireDate: string;
  terminationDate: string;
  // caps
  topeUf: number;
  topeBaseEnPesos: number;
  baseTopada: number;
  capBaseAplicado: boolean; // baseMonthly exceeded the 90-UF cap
  aniosServicio: number;
  aniosIndemnizables: number;
  capAniosAplicado: boolean; // años exceeded 11
  // feriado
  dailyRate: number;
  feriadoDias: number;
  // components
  montoIas: number;
  montoAvisoPrevio: number;
  montoFeriado: number;
  montoTotal: number;
  disclaimer: string;
}

export function computeFiniquito(input: FiniquitoInput): FiniquitoBreakdown {
  const { causal, ufValue, baseMonthly, hireDate, terminationDate, avisoPrevioDado, feriadoDias } =
    input;

  const topeBaseEnPesos = TOPE_UF * ufValue;
  const baseTopada = Math.min(baseMonthly, topeBaseEnPesos);
  const capBaseAplicado = baseMonthly > topeBaseEnPesos;

  const aniosServicio = computeAniosServicio(hireDate, terminationDate);
  const aniosIndemnizables = Math.min(aniosServicio, ANIOS_CAP);
  const capAniosAplicado = aniosServicio > ANIOS_CAP;

  const hasIas = IAS_CAUSALES.includes(causal);
  const montoIas = hasIas ? baseTopada * aniosIndemnizables : 0;
  /* Aviso previo (sustitutiva) only when the IAS régimen applies AND no 30-day
     notice was given. */
  const montoAvisoPrevio = hasIas && !avisoPrevioDado ? baseTopada : 0;

  /* Feriado proporcional — full base (NOT topada), every causal. */
  const dailyRate = baseMonthly / 30;
  const montoFeriado = feriadoDias * dailyRate;

  const montoTotal = montoIas + montoAvisoPrevio + montoFeriado;

  return {
    causal,
    ufValue,
    baseMonthly,
    avisoPrevioDado,
    hireDate: startOfUtcDay(hireDate).toISOString(),
    terminationDate: startOfUtcDay(terminationDate).toISOString(),
    topeUf: TOPE_UF,
    topeBaseEnPesos: round2(topeBaseEnPesos),
    baseTopada: round2(baseTopada),
    capBaseAplicado,
    aniosServicio,
    aniosIndemnizables,
    capAniosAplicado,
    dailyRate: round2(dailyRate),
    feriadoDias,
    montoIas: round2(montoIas),
    montoAvisoPrevio: round2(montoAvisoPrevio),
    montoFeriado: round2(montoFeriado),
    montoTotal: round2(montoTotal),
    disclaimer: DISCLAIMER,
  };
}
