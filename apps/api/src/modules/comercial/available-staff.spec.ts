/* COM-012 — proves the PII-safe availability projection: the handler calls ONLY the
 * reason-free DisponibilidadService.forServiceDisponibles and NEVER a reason-bearing
 * sibling, and its response carries EXACTLY {employeeId, fullName, cargo} (so a
 * state/reason/until — health-adjacent PII — can never leak). Plus the date default +
 * invalid-date 400. Tests the controller method directly with a spied fake service. */
import { BadRequestException } from '@nestjs/common';
import { ComercialController } from './comercial.controller';

type Any = Record<string, unknown>;

/* The reason-bearing methods on DisponibilidadService — they resolve a NO_DISPONIBLE
 * `reason` ('Licencia médica', 'Permiso', 'Vacaciones'). They must NEVER be reached. */
const REASON_BEARING = [
  'getAvailability',
  'forServiceSingle',
  'forServiceBatch',
  'getMatriz',
  'getAlertas',
] as const;

function makeController(employees: Any[]) {
  const forServiceDisponibles = jest.fn((_c: string, _u: string, dateStr?: string) =>
    Promise.resolve({
      date: '2026-07-15T00:00:00.000Z',
      count: employees.length,
      employees,
      dateStr,
    }),
  );
  const spies: Record<string, jest.Mock> = {};
  for (const m of REASON_BEARING) spies[m] = jest.fn();
  const disponibilidad = { forServiceDisponibles, ...spies } as never;
  return { ctrl: new ComercialController(disponibilidad), forServiceDisponibles, spies };
}

describe('COM-012 available-staff — safe, reason-free projection', () => {
  it('calls ONLY forServiceDisponibles — never a reason-bearing method', async () => {
    const { ctrl, forServiceDisponibles, spies } = makeController([
      { employeeId: 'e1', fullName: 'Ana Soto', cargo: 'Operaria de aseo' },
    ]);
    await ctrl.availableStaff('c1', { id: 'u1' }, '2026-07-15');
    expect(forServiceDisponibles).toHaveBeenCalledTimes(1);
    for (const m of REASON_BEARING) expect(spies[m]).not.toHaveBeenCalled();
  });

  it('response objects contain EXACTLY employeeId/fullName/cargo — extra fields stripped', async () => {
    // Feed a row carrying health-adjacent fields; prove they never leave the endpoint.
    const { ctrl } = makeController([
      {
        employeeId: 'e1',
        fullName: 'Ana Soto',
        cargo: 'Operaria de aseo',
        state: 'DISPONIBLE',
        reason: 'Licencia médica',
        until: '2026-08-01',
        secret: 'leak',
      },
    ]);
    const res = (await ctrl.availableStaff('c1', { id: 'u1' }, '2026-07-15')) as Any[];
    expect(res).toHaveLength(1);
    expect(Object.keys(res[0]).sort()).toEqual(['cargo', 'employeeId', 'fullName']);
    expect(res[0]).toEqual({ employeeId: 'e1', fullName: 'Ana Soto', cargo: 'Operaria de aseo' });
  });

  it('defaults the date to undefined (→ today downstream) when no ?date is given', async () => {
    const { ctrl, forServiceDisponibles } = makeController([]);
    await ctrl.availableStaff('c1', { id: 'u1' }, undefined);
    expect(forServiceDisponibles).toHaveBeenCalledWith('c1', 'u1', undefined);
  });

  it('passes a valid ?date through to the service', async () => {
    const { ctrl, forServiceDisponibles } = makeController([]);
    await ctrl.availableStaff('c1', { id: 'u1' }, '2026-07-15');
    expect(forServiceDisponibles).toHaveBeenCalledWith('c1', 'u1', '2026-07-15');
  });

  it('rejects a malformed / impossible date with 400 and never calls the service', async () => {
    const { ctrl, forServiceDisponibles } = makeController([]);
    await expect(ctrl.availableStaff('c1', { id: 'u1' }, '15-07-2026')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(ctrl.availableStaff('c1', { id: 'u1' }, '2026-02-30')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(forServiceDisponibles).not.toHaveBeenCalled();
  });
});
