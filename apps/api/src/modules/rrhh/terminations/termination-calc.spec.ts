/* HR-010 — the CERTIFIED finiquito calc tests (owner-validated acceptance):
 * dual cap (11 años + 90 UF), causal drives components, feriado at full base,
 * the fracción>6-meses año rule, and the disclaimer. */
import {
  computeAniosServicio,
  computeFiniquito,
  DISCLAIMER,
  type FiniquitoInput,
} from './termination-calc';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const baseInput = (over: Partial<FiniquitoInput> = {}): FiniquitoInput => ({
  causal: 'NECESIDADES_EMPRESA',
  ufValue: 39000,
  baseMonthly: 1_000_000,
  hireDate: d('2021-01-01'),
  terminationDate: d('2026-01-01'), // exactly 5 years
  avisoPrevioDado: true,
  feriadoDias: 0,
  ...over,
});

describe('computeAniosServicio — fracción > 6 meses rounds up', () => {
  it('exactly 5 years → 5', () => {
    expect(computeAniosServicio(d('2021-01-01'), d('2026-01-01'))).toBe(5);
  });
  it('4y7m → 5 (fraction > 6 months)', () => {
    expect(computeAniosServicio(d('2021-01-01'), d('2025-08-01'))).toBe(5);
  });
  it('4y5m → 4 (fraction ≤ 6 months)', () => {
    expect(computeAniosServicio(d('2021-01-01'), d('2025-06-01'))).toBe(4);
  });
  it('exactly 4y6m → 4 (strictly greater than 6 required)', () => {
    expect(computeAniosServicio(d('2021-01-01'), d('2025-07-01'))).toBe(4);
  });
  it('4y6m20d → 5 (day-precise: 6 months PLUS days is > 6 months)', () => {
    expect(computeAniosServicio(d('2020-01-10'), d('2024-07-30'))).toBe(5);
  });
  it('4y6m+days via month-decrement → 5 (robust across the day-of-month edge)', () => {
    // hire day 20 > term day 10 → the naive day-of-month compare would miss this
    expect(computeAniosServicio(d('2020-01-20'), d('2024-08-10'))).toBe(5);
  });
  it('4y6m exact end-of-month boundary → 4 (no extra days)', () => {
    expect(computeAniosServicio(d('2020-01-31'), d('2024-07-31'))).toBe(4);
  });
  it('14 years → 14 (uncapped here; cap applies to indemnizables)', () => {
    expect(computeAniosServicio(d('2010-01-01'), d('2024-01-01'))).toBe(14);
  });
  it('termination before hire → 0', () => {
    expect(computeAniosServicio(d('2026-01-01'), d('2021-01-01'))).toBe(0);
  });
});

describe('computeFiniquito — necesidades de la empresa', () => {
  it('5y, base 1.000.000, UF 39.000 (base under the 90-UF cap), notice given → IAS = 1.000.000×5, no aviso, no feriado', () => {
    const r = computeFiniquito(baseInput());
    expect(r.topeBaseEnPesos).toBe(90 * 39000); // 3.510.000
    expect(r.capBaseAplicado).toBe(false); // 1.000.000 < 3.510.000
    expect(r.baseTopada).toBe(1_000_000);
    expect(r.aniosIndemnizables).toBe(5);
    expect(r.montoIas).toBe(5_000_000);
    expect(r.montoAvisoPrevio).toBe(0); // notice was given
    expect(r.montoFeriado).toBe(0);
    expect(r.montoTotal).toBe(5_000_000);
    expect(r.disclaimer).toBe(DISCLAIMER);
  });

  it('no notice given → +aviso previo = baseTopada×1', () => {
    const r = computeFiniquito(baseInput({ avisoPrevioDado: false }));
    expect(r.montoAvisoPrevio).toBe(1_000_000);
    expect(r.montoTotal).toBe(6_000_000); // IAS 5M + aviso 1M
  });

  it('+ feriado from saldo uses FULL base (not topada): 10 días × (base/30)', () => {
    const r = computeFiniquito(baseInput({ feriadoDias: 10 }));
    expect(r.dailyRate).toBe(Math.round((1_000_000 / 30) * 100) / 100);
    expect(r.montoFeriado).toBe(Math.round(10 * (1_000_000 / 30) * 100) / 100); // ~333.333,33
    expect(r.montoTotal).toBe(5_000_000 + r.montoFeriado);
  });

  it('base OVER the 90-UF cap → IAS uses baseTopada, not baseMonthly; feriado still uses full base', () => {
    // base 5.000.000 > tope 3.510.000 → IAS/aviso topada; feriado at full 5.000.000/30
    const r = computeFiniquito(
      baseInput({ baseMonthly: 5_000_000, avisoPrevioDado: false, feriadoDias: 6 }),
    );
    expect(r.capBaseAplicado).toBe(true);
    expect(r.baseTopada).toBe(3_510_000);
    expect(r.montoIas).toBe(3_510_000 * 5); // topada
    expect(r.montoAvisoPrevio).toBe(3_510_000); // topada
    expect(r.montoFeriado).toBe(Math.round(6 * (5_000_000 / 30) * 100) / 100); // FULL base, NOT topada
  });

  it('14 años → añosIndemnizables capped at 11', () => {
    const r = computeFiniquito(
      baseInput({ hireDate: d('2010-01-01'), terminationDate: d('2024-01-01') }),
    );
    expect(r.aniosServicio).toBe(14);
    expect(r.aniosIndemnizables).toBe(11);
    expect(r.capAniosAplicado).toBe(true);
    expect(r.montoIas).toBe(1_000_000 * 11);
  });
});

describe('computeFiniquito — causal drives components', () => {
  it('DESAHUCIO_EMPLEADOR uses the same IAS régimen as necesidades', () => {
    const r = computeFiniquito(
      baseInput({ causal: 'DESAHUCIO_EMPLEADOR', avisoPrevioDado: false }),
    );
    expect(r.montoIas).toBe(5_000_000);
    expect(r.montoAvisoPrevio).toBe(1_000_000);
  });

  it('RENUNCIA → IAS=0, aviso=0, only feriado', () => {
    const r = computeFiniquito(
      baseInput({ causal: 'RENUNCIA', avisoPrevioDado: false, feriadoDias: 12 }),
    );
    expect(r.montoIas).toBe(0);
    expect(r.montoAvisoPrevio).toBe(0);
    expect(r.montoFeriado).toBe(Math.round(12 * (1_000_000 / 30) * 100) / 100);
    expect(r.montoTotal).toBe(r.montoFeriado);
  });

  it('MUTUO_ACUERDO → only feriado', () => {
    const r = computeFiniquito(
      baseInput({ causal: 'MUTUO_ACUERDO', avisoPrevioDado: false, feriadoDias: 5 }),
    );
    expect(r.montoIas).toBe(0);
    expect(r.montoAvisoPrevio).toBe(0);
  });

  it('CADUCIDAD_ART160 → only feriado (no IAS, no aviso even without notice)', () => {
    const r = computeFiniquito(
      baseInput({ causal: 'CADUCIDAD_ART160', avisoPrevioDado: false, feriadoDias: 8 }),
    );
    expect(r.montoIas).toBe(0);
    expect(r.montoAvisoPrevio).toBe(0);
    expect(r.montoFeriado).toBe(Math.round(8 * (1_000_000 / 30) * 100) / 100);
  });

  it('PLAZO_FIJO_TERMINO → only feriado', () => {
    const r = computeFiniquito(
      baseInput({ causal: 'PLAZO_FIJO_TERMINO', avisoPrevioDado: false, feriadoDias: 3 }),
    );
    expect(r.montoIas).toBe(0);
    expect(r.montoAvisoPrevio).toBe(0);
  });
});
