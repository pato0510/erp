// Chilean RUT (Rol Único Tributario) helpers — Módulo 11 check digit.
//
// HR-001: lives in @erp/utils (scope:shared) so BOTH the web app (display via
// lib/formatters re-export) and the api (RRHH DTO validation in later tickets)
// use one implementation. No external dependencies.

/**
 * Strip everything except digits and the K check digit, upper-casing the K.
 * Accepts any formatting ("12.345.678-5", "12345678-5", "123456785").
 */
export function cleanRut(rut: string | null | undefined): string {
  return (rut ?? '').replace(/[^0-9kK]/g, '').toUpperCase();
}

/**
 * Compute the Módulo-11 check digit for a RUT body (the number WITHOUT the DV).
 * Multipliers cycle 2,3,4,5,6,7 from the rightmost digit. Returns '0'–'9' or 'K'.
 */
export function computeRutDv(body: string): string {
  let sum = 0;
  let multiplier = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i], 10) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const remainder = 11 - (sum % 11);
  if (remainder === 11) return '0';
  if (remainder === 10) return 'K';
  return String(remainder);
}

/**
 * True when the RUT's check digit matches its Módulo-11 computation.
 * Accepts any formatting and either case of the K digit.
 */
export function validateRut(rut: string | null | undefined): boolean {
  const clean = cleanRut(rut);
  if (clean.length < 2) return false;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  if (!/^\d+$/.test(body)) return false;
  return computeRutDv(body) === dv;
}

/**
 * Format a RUT as "12.345.678-5" (thousands dots + hyphen + DV). Pure
 * presentation — does NOT validate the check digit. Returns the original input
 * when there is too little to format.
 */
export function formatRUT(rut: string | null | undefined): string {
  const clean = cleanRut(rut);
  if (clean.length < 2) return rut ?? '';
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  const grouped = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${grouped}-${dv}`;
}
