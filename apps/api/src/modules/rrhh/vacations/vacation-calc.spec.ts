/* HR-011 — the CERTIFIED calc tests. These are the owner-validated acceptance
 * checks: 12 months → annualDays; 6 months → 7.5; partial month adds 0.04167/day;
 * Mon–Fri-only business-day counting. */
import {
  computeAccrued,
  computeBalance,
  countBusinessDays,
  monthsAndPartialDays,
} from './vacation-calc';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('computeAccrued — accrual at 1.25 días hábiles/month (annualDays=15)', () => {
  it('exactly 12 months → annualDays (15)', () => {
    expect(computeAccrued(d('2025-01-01'), d('2026-01-01'), 15)).toBe(15);
  });

  it('exactly 6 months → 7.5', () => {
    expect(computeAccrued(d('2025-01-01'), d('2025-07-01'), 15)).toBe(7.5);
  });

  it('exactly 1 month → 1.25', () => {
    expect(computeAccrued(d('2025-01-01'), d('2025-02-01'), 15)).toBe(1.25);
  });

  it('a partial month adds 0.04167 días per day worked', () => {
    // 6 completed months (7.5) + 10 partial days × (1.25/30=0.0416667)
    expect(computeAccrued(d('2025-01-01'), d('2025-07-11'), 15)).toBeCloseTo(
      7.5 + 10 * (1.25 / 30),
      5,
    );
  });

  it('day 0 (hireDate == today) → 0', () => {
    expect(computeAccrued(d('2025-01-01'), d('2025-01-01'), 15)).toBe(0);
  });

  it('future hireDate → 0 (never negative)', () => {
    expect(computeAccrued(d('2025-06-01'), d('2025-01-01'), 15)).toBe(0);
  });

  it('annualDays is a PARAMETER — 20-day austral zone: 12 months → 20', () => {
    expect(computeAccrued(d('2025-01-01'), d('2026-01-01'), 20)).toBe(20);
  });

  it('clamps month math across short months (Jan 31 hire, 1 month → Feb end)', () => {
    // hire Jan 31; on Feb 28 that is one completed month (clamped), so 1.25
    expect(computeAccrued(d('2025-01-31'), d('2025-02-28'), 15)).toBe(1.25);
  });
});

describe('monthsAndPartialDays', () => {
  it('6 months + 10 days', () => {
    expect(monthsAndPartialDays(d('2025-01-01'), d('2025-07-11'))).toEqual({
      months: 6,
      partialDays: 10,
    });
  });
});

describe('countBusinessDays — Mon–Fri only, inclusive', () => {
  it('a full Mon–Fri week = 5', () => {
    // 2025-06-02 is a Monday
    expect(countBusinessDays(d('2025-06-02'), d('2025-06-06'))).toBe(5);
  });

  it('a range spanning a weekend counts only the weekdays', () => {
    // Fri 2025-06-06 → Mon 2025-06-09 = Fri + Mon = 2 (Sat/Sun skipped)
    expect(countBusinessDays(d('2025-06-06'), d('2025-06-09'))).toBe(2);
  });

  it('Mon → next Mon (8 calendar days) = 6 business days', () => {
    expect(countBusinessDays(d('2025-06-02'), d('2025-06-09'))).toBe(6);
  });

  it('a single Saturday = 0', () => {
    // 2025-06-07 is a Saturday
    expect(countBusinessDays(d('2025-06-07'), d('2025-06-07'))).toBe(0);
  });

  it('a single weekday = 1', () => {
    expect(countBusinessDays(d('2025-06-04'), d('2025-06-04'))).toBe(1);
  });

  it('two full weeks (Mon→Fri+1wk) = 10', () => {
    expect(countBusinessDays(d('2025-06-02'), d('2025-06-13'))).toBe(10);
  });
});

describe('computeBalance — saldo = devengado + adicionales − (APROBADO+TOMADO)', () => {
  it('subtracts APROBADO+TOMADO, surfaces PENDIENTE separately, ignores RECHAZADO/CANCELADO', () => {
    const bal = computeBalance(d('2025-01-01'), d('2026-01-01'), 15, 3, [
      { status: 'APROBADO', diasHabiles: 5 },
      { status: 'TOMADO', diasHabiles: 2 },
      { status: 'PENDIENTE', diasHabiles: 4 },
      { status: 'RECHAZADO', diasHabiles: 10 },
      { status: 'CANCELADO', diasHabiles: 10 },
    ]);
    expect(bal.devengado).toBe(15);
    expect(bal.diasAdicionales).toBe(3);
    expect(bal.tomados).toBe(7); // 5 + 2
    expect(bal.pendientes).toBe(4); // not subtracted
    expect(bal.saldoDisponible).toBe(15 + 3 - 7); // 11
    expect(bal.feriadoAnualDiasHabiles).toBe(15);
  });
});
