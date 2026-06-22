/**
 * RRHH — DIRECTIONAL Chilean payroll calculator (DEMO).
 *
 * Pure functions. All money values are CLP integers (rounded). The numbers are
 * directional approximations of Chilean liquidación/finiquito rules driven by a
 * PayrollParameter row (UF/UTM/topes/AFP rates/tax brackets). They are NOT a
 * certified payroll engine — this is a frontend-first demo.
 */

export interface TaxBracket {
  desdeUtm: number;
  hastaUtm: number | null; // null = open-ended top bracket
  factor: number;
  rebajaUtm: number;
}

export interface PayrollParams {
  ufValue: number;
  utmValue: number;
  topeImponibleUf: number;
  topeCesantiaUf: number;
  saludRate: number; // 0.07
  cesantiaRateTrabajador: number; // 0.006
  afpRates: Record<string, number>; // AFP -> comisión (decimal fraction)
  taxBrackets: TaxBracket[];
}

export interface LiquidacionBreakdown {
  baseImponible: number;
  afp: { nombre: string; monto: number };
  salud: number;
  cesantia: number;
  totalPrevisional: number;
  baseTributable: number;
  impuestoUnico: number;
  totalDescuentos: number;
  sueldoLiquido: number;
}

const COTIZACION_AFP_OBLIGATORIA = 0.1; // 10% cotización, comisión se suma encima

const round = (n: number): number => Math.round(n);

/**
 * Resolves the AFP commission fraction for a given AFP name, tolerant of
 * casing/whitespace. Falls back to the first configured AFP's rate (or 0).
 */
export function resolveAfp(
  afpRates: Record<string, number>,
  afpNombre?: string,
): { nombre: string; comision: number } {
  const entries = Object.entries(afpRates ?? {});
  if (afpNombre) {
    const wanted = afpNombre.trim().toLowerCase();
    const hit = entries.find(([name]) => name.trim().toLowerCase() === wanted);
    if (hit) return { nombre: hit[0], comision: Number(hit[1]) };
  }
  if (entries.length > 0) {
    return { nombre: afpNombre ?? entries[0][0], comision: Number(entries[0][1]) };
  }
  return { nombre: afpNombre ?? 'AFP', comision: 0 };
}

/**
 * Picks the monthly tax bracket whose [desdeUtm, hastaUtm) contains the
 * baseTributable expressed in UTM.
 */
export function pickTaxBracket(brackets: TaxBracket[], baseTributableUtm: number): TaxBracket {
  for (const b of brackets) {
    const lo = b.desdeUtm;
    const hi = b.hastaUtm;
    if (baseTributableUtm >= lo && (hi === null || baseTributableUtm < hi)) {
      return b;
    }
  }
  // Fallback: top bracket (open-ended) or the last one.
  return brackets[brackets.length - 1];
}

/**
 * Full liquidación de sueldo (directional). See module rules in CLAUDE.md.
 */
export function calcularLiquidacion(
  sueldoBruto: number,
  params: PayrollParams,
  afpNombre?: string,
): LiquidacionBreakdown {
  const bruto = Math.max(0, Number(sueldoBruto) || 0);

  const topeImponible = params.topeImponibleUf * params.ufValue;
  const baseImponible = Math.min(bruto, topeImponible);

  const { nombre: afpResuelta, comision } = resolveAfp(params.afpRates, afpNombre);
  const afpMonto = round(baseImponible * (COTIZACION_AFP_OBLIGATORIA + comision));

  const salud = round(baseImponible * params.saludRate);

  const baseCesantia = Math.min(bruto, params.topeCesantiaUf * params.ufValue);
  const cesantia = round(baseCesantia * params.cesantiaRateTrabajador);

  const totalPrevisional = afpMonto + salud + cesantia;
  const baseTributable = bruto - totalPrevisional;

  const baseTributableUtm = baseTributable / params.utmValue;
  const bracket = pickTaxBracket(params.taxBrackets, baseTributableUtm);
  const impuestoUnico = Math.max(
    0,
    round(baseTributable * bracket.factor - bracket.rebajaUtm * params.utmValue),
  );

  const totalDescuentos = totalPrevisional + impuestoUnico;
  const sueldoLiquido = bruto - totalDescuentos;

  return {
    baseImponible: round(baseImponible),
    afp: { nombre: afpResuelta, monto: afpMonto },
    salud,
    cesantia,
    totalPrevisional,
    baseTributable: round(baseTributable),
    impuestoUnico,
    totalDescuentos,
    sueldoLiquido,
  };
}

/* ── Finiquito (directional) ────────────────────────────────────────────── */

export type FiniquitoCausal =
  | 'necesidades_empresa'
  | 'desahucio'
  | 'renuncia'
  | 'mutuo_acuerdo'
  | 'caducidad'; // art. 160 (despido por causa) — sin indemnización

export interface FiniquitoLineItem {
  concepto: string;
  monto: number;
}

export interface FiniquitoBreakdown {
  indemnizacionAniosServicio: number;
  avisoPrevio: number;
  feriadoProporcional: number;
  total: number;
  detalle: FiniquitoLineItem[];
}

const CAUSALES_CON_INDEMNIZACION = new Set<FiniquitoCausal>([
  'necesidades_empresa',
  'desahucio',
]);

const TOPE_BASE_INDEMNIZACION_UF = 90; // base topeada 90 UF
const TOPE_ANIOS = 11;

export function calcularFiniquito(
  input: {
    sueldo: number;
    aniosServicio: number;
    mesesUltimoPeriodo: number;
    causal: FiniquitoCausal;
    dioAvisoPrevio: boolean;
  },
  ufValue: number,
): FiniquitoBreakdown {
  const sueldo = Math.max(0, Number(input.sueldo) || 0);
  const anios = Math.max(0, Number(input.aniosServicio) || 0);
  const meses = Math.max(0, Number(input.mesesUltimoPeriodo) || 0);

  const baseTopeada = Math.min(sueldo, TOPE_BASE_INDEMNIZACION_UF * ufValue);
  const tieneIndemnizacion = CAUSALES_CON_INDEMNIZACION.has(input.causal);

  const indemnizacionAniosServicio = tieneIndemnizacion
    ? round(Math.min(anios, TOPE_ANIOS) * baseTopeada)
    : 0;

  const avisoPrevio =
    tieneIndemnizacion && !input.dioAvisoPrevio ? round(baseTopeada) : 0;

  // Feriado proporcional aplica a todas las causales.
  const feriadoProporcional = round(meses * 1.25 * (sueldo / 30));

  const total = indemnizacionAniosServicio + avisoPrevio + feriadoProporcional;

  const detalle: FiniquitoLineItem[] = [
    { concepto: 'Indemnización por años de servicio', monto: indemnizacionAniosServicio },
    { concepto: 'Indemnización sustitutiva del aviso previo', monto: avisoPrevio },
    { concepto: 'Feriado proporcional', monto: feriadoProporcional },
  ];

  return {
    indemnizacionAniosServicio,
    avisoPrevio,
    feriadoProporcional,
    total,
    detalle,
  };
}
