/* COM-004b — proves GET /comercial/permissions returns flags computed FROM the
 * CASL ability (not role strings), matching the ability matrix for every role.
 * Tests the controller method directly with a factory-built ability per role
 * (mirrors the guard specs). NOTE: in production the endpoint is gated on
 * `read Account`, so ANALYST/VIEWER 403 before this runs — but the flag LOGIC is
 * verified here for all six roles. */
import { UserRole } from '@prisma/client';
import { CaslAbilityFactory } from '../common/casl/casl-ability.factory';
import { ComercialController } from './comercial.controller';

const FULL = { read: true, create: true, update: true, delete: true };
const READ_ONLY = { read: true, create: false, update: false, delete: false };
const NONE = { read: false, create: false, update: false, delete: false };

describe('COM-004b ComercialController.permissions — ability-derived flags', () => {
  const factory = new CaslAbilityFactory();
  const controller = new ComercialController();
  const perms = (role: UserRole) => controller.permissions(factory.defineAbilityFor(role));

  it('SUPER_ADMIN / ADMIN: full CRUD on every Comercial subject (manage all)', () => {
    for (const role of [UserRole.SUPER_ADMIN, UserRole.ADMIN]) {
      const p = perms(role);
      expect(p.account).toEqual(FULL);
      expect(p.contact).toEqual(FULL);
      expect(p.opportunity).toEqual(FULL);
      expect(p.serviceCatalog).toEqual(FULL);
    }
  });

  it('MANAGER: full CRUD on account/contact/opportunity/serviceCatalog', () => {
    const p = perms(UserRole.MANAGER);
    expect(p.account).toEqual(FULL);
    expect(p.contact).toEqual(FULL);
    expect(p.opportunity).toEqual(FULL);
    expect(p.serviceCatalog).toEqual(FULL);
  });

  it('ACCOUNTANT: read-only on account/contact/opportunity/serviceCatalog (no create/update/delete)', () => {
    const p = perms(UserRole.ACCOUNTANT);
    expect(p.account).toEqual(READ_ONLY);
    expect(p.contact).toEqual(READ_ONLY);
    expect(p.opportunity).toEqual(READ_ONLY); // COM-007 — sees the board, cannot mutate
    expect(p.serviceCatalog).toEqual(READ_ONLY);
  });

  it('ANALYST: no account/contact/opportunity; serviceCatalog read-only (COM-002 shared catalog)', () => {
    const p = perms(UserRole.ANALYST);
    expect(p.account).toEqual(NONE);
    expect(p.contact).toEqual(NONE);
    expect(p.opportunity).toEqual(NONE); // floored — the board 403s (sin-permiso state)
    expect(p.serviceCatalog).toEqual(READ_ONLY);
  });

  it('VIEWER: no account/contact/opportunity; serviceCatalog read-only', () => {
    const p = perms(UserRole.VIEWER);
    expect(p.account).toEqual(NONE);
    expect(p.contact).toEqual(NONE);
    expect(p.opportunity).toEqual(NONE);
    expect(p.serviceCatalog).toEqual(READ_ONLY);
  });
});
