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
  // permissions() ignores the injected DisponibilidadService (COM-012); a stub suffices.
  const controller = new ComercialController({} as never);
  const perms = (role: UserRole) => controller.permissions(factory.defineAbilityFor(role));

  it('SUPER_ADMIN / ADMIN: full CRUD on every Comercial subject (manage all) + availability read', () => {
    for (const role of [UserRole.SUPER_ADMIN, UserRole.ADMIN]) {
      const p = perms(role);
      expect(p.account).toEqual(FULL);
      expect(p.contact).toEqual(FULL);
      expect(p.opportunity).toEqual(FULL);
      expect(p.activity).toEqual(FULL);
      expect(p.opportunityNote).toEqual({ ...FULL, manageAny: true }); // COM-016 — delete-any via manage all
      expect(p.quote).toEqual(FULL);
      expect(p.serviceCatalog).toEqual(FULL);
      expect(p.availability).toEqual({ read: true }); // COM-012
    }
  });

  it('MANAGER: full CRUD on account/contact/opportunity/activity/quote/serviceCatalog + availability read', () => {
    const p = perms(UserRole.MANAGER);
    expect(p.account).toEqual(FULL);
    expect(p.contact).toEqual(FULL);
    expect(p.opportunity).toEqual(FULL);
    expect(p.activity).toEqual(FULL);
    expect(p.opportunityNote).toEqual({ ...FULL, manageAny: false }); // COM-016 — CRUD, but never delete-any
    expect(p.quote).toEqual(FULL);
    expect(p.serviceCatalog).toEqual(FULL);
    expect(p.availability).toEqual({ read: true }); // COM-012 — RRHH §1.2 availability audience
  });

  it('ACCOUNTANT: read-only on account/contact/opportunity/activity/quote/serviceCatalog; NO availability (deliberate)', () => {
    const p = perms(UserRole.ACCOUNTANT);
    expect(p.account).toEqual(READ_ONLY);
    expect(p.contact).toEqual(READ_ONLY);
    expect(p.opportunity).toEqual(READ_ONLY); // COM-007 — sees the board, cannot mutate
    expect(p.activity).toEqual(READ_ONLY); // COM-008 — sees timelines, cannot register/edit/delete
    expect(p.opportunityNote).toEqual({ ...READ_ONLY, manageAny: false }); // COM-016 — sees the thread, cannot write
    expect(p.quote).toEqual(READ_ONLY); // COM-010 — sees quotes, cannot create/edit/send/delete
    expect(p.serviceCatalog).toEqual(READ_ONLY);
    expect(p.availability).toEqual({ read: false }); // COM-012 — excluded from availability
  });

  it('ANALYST: no account/contact/opportunity/activity/quote/availability; serviceCatalog read-only', () => {
    const p = perms(UserRole.ANALYST);
    expect(p.account).toEqual(NONE);
    expect(p.contact).toEqual(NONE);
    expect(p.opportunity).toEqual(NONE); // floored — the board 403s (sin-permiso state)
    expect(p.activity).toEqual(NONE); // floored — never reaches the timeline
    expect(p.opportunityNote).toEqual({ ...NONE, manageAny: false }); // COM-016 — floored
    expect(p.quote).toEqual(NONE); // floored — never reaches quotes
    expect(p.serviceCatalog).toEqual(READ_ONLY);
    expect(p.availability).toEqual({ read: false }); // COM-012
  });

  it('VIEWER: no account/contact/opportunity/activity/quote/availability; serviceCatalog read-only', () => {
    const p = perms(UserRole.VIEWER);
    expect(p.account).toEqual(NONE);
    expect(p.contact).toEqual(NONE);
    expect(p.opportunity).toEqual(NONE);
    expect(p.activity).toEqual(NONE);
    expect(p.opportunityNote).toEqual({ ...NONE, manageAny: false }); // COM-016 — no grant by enumeration
    expect(p.quote).toEqual(NONE);
    expect(p.serviceCatalog).toEqual(READ_ONLY);
    expect(p.availability).toEqual({ read: false }); // COM-012
  });
});

/* COM-016 — opportunityNote MIRRORS activity cell by cell for every role (the CRUD
 * quartet), and `manageAny` (delete-any-note) is true ONLY for ADMIN/SUPER_ADMIN —
 * pinned so MANAGER can never be shown a delete control on a colleague's note. */
describe('COM-016 ComercialController.permissions — opportunityNote mirrors activity + manageAny', () => {
  const factory = new CaslAbilityFactory();
  const controller = new ComercialController({} as never);
  const perms = (role: UserRole) => controller.permissions(factory.defineAbilityFor(role));

  it('opportunityNote CRUD flags equal activity flags for every role', () => {
    for (const role of Object.values(UserRole)) {
      const note = perms(role).opportunityNote;
      const crud = {
        read: note.read,
        create: note.create,
        update: note.update,
        delete: note.delete,
      };
      expect(crud).toEqual(perms(role).activity);
    }
  });

  it('manageAny is true only for ADMIN and SUPER_ADMIN', () => {
    for (const role of Object.values(UserRole)) {
      const expected = role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;
      expect(perms(role).opportunityNote.manageAny).toBe(expected);
    }
  });
});
