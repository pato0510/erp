/* HR-001 — unit tests for the shared Chilean RUT helpers (@erp/utils/rut).
 * They live here because apps/api is the only project with a configured Jest
 * runner, and its jest.config maps `@erp/utils` to the lib source. */
import { validateRut, formatRUT, computeRutDv, cleanRut } from '@erp/utils';

describe('RUT helpers — Módulo 11', () => {
  describe('validateRut', () => {
    it('accepts valid RUTs with a numeric check digit', () => {
      expect(validateRut('11.111.111-1')).toBe(true);
      expect(validateRut('12.345.678-5')).toBe(true);
      expect(validateRut('11111111-1')).toBe(true); // unformatted
      expect(validateRut('12345678-5')).toBe(true);
    });

    it('accepts a valid RUT with a K check digit, case-insensitive', () => {
      expect(validateRut('16.498.012-K')).toBe(true);
      expect(validateRut('16498012-k')).toBe(true);
      expect(validateRut('16498012K')).toBe(true);
    });

    it('accepts a valid RUT with a 0 check digit', () => {
      // Find the smallest body whose Módulo-11 DV is '0' and round-trip it.
      let body = '';
      for (let n = 1; n < 1_000_000; n++) {
        if (computeRutDv(String(n)) === '0') {
          body = String(n);
          break;
        }
      }
      expect(body).not.toBe('');
      expect(validateRut(`${body}-0`)).toBe(true);
      expect(validateRut(`${body}-1`)).toBe(false);
    });

    it('rejects RUTs whose check digit does not match', () => {
      expect(validateRut('12.345.678-9')).toBe(false); // real DV is 5
      expect(validateRut('16.498.012-0')).toBe(false); // real DV is K
      expect(validateRut('11.111.111-2')).toBe(false);
    });

    it('rejects malformed / edge-case input', () => {
      expect(validateRut('')).toBe(false);
      expect(validateRut('1')).toBe(false); // body+DV needs >= 2 chars
      expect(validateRut('abc')).toBe(false);
      expect(validateRut('-')).toBe(false);
      expect(validateRut('K')).toBe(false);
      expect(validateRut(null)).toBe(false);
      expect(validateRut(undefined)).toBe(false);
    });
  });

  describe('computeRutDv', () => {
    it('computes numeric and K check digits', () => {
      expect(computeRutDv('11111111')).toBe('1');
      expect(computeRutDv('12345678')).toBe('5');
      expect(computeRutDv('16498012')).toBe('K');
    });
  });

  describe('formatRUT', () => {
    it('formats with thousands dots and hyphen-DV', () => {
      expect(formatRUT('111111111')).toBe('11.111.111-1');
      expect(formatRUT('12345678-5')).toBe('12.345.678-5');
      expect(formatRUT('16498012k')).toBe('16.498.012-K'); // upper-cases the K
      expect(formatRUT('1.234.567-8')).toBe('1.234.567-8'); // idempotent
    });

    it('returns the input unchanged when there is too little to format', () => {
      expect(formatRUT('1')).toBe('1');
      expect(formatRUT('')).toBe('');
      expect(formatRUT(null)).toBe('');
      expect(formatRUT(undefined)).toBe('');
    });
  });

  describe('cleanRut', () => {
    it('strips formatting and upper-cases the K', () => {
      expect(cleanRut('12.345.678-5')).toBe('123456785');
      expect(cleanRut('16.498.012-k')).toBe('16498012K');
      expect(cleanRut(null)).toBe('');
    });
  });
});
