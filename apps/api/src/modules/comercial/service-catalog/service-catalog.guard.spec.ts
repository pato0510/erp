/* COM-002 — proves the ServiceCatalog authorization matrix the controller relies
 * on: service_catalog is the shared, non-sensitive catalog, so EVERY role reads
 * it (read gates on `read ServiceCatalogSubject`), but WRITE (create/update/
 * delete) is MANAGER/ADMIN/SUPER_ADMIN only. This confirms the COM-001 default-
 * deny floor was reversed for read on THIS subject only, and that write was not
 * widened to ACCOUNTANT/ANALYST/VIEWER. */
import { UserRole } from '@prisma/client';
import { CaslAbilityFactory, ServiceCatalogSubject } from '../../common/casl/casl-ability.factory';

describe('COM-002 ServiceCatalog authorization matrix', () => {
  const factory = new CaslAbilityFactory();
  const ALL_ROLES = [
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.ACCOUNTANT,
    UserRole.ANALYST,
    UserRole.VIEWER,
  ];
  const can = (role: UserRole, action: 'read' | 'create' | 'update' | 'delete') =>
    factory.defineAbilityFor(role).can(action, ServiceCatalogSubject);

  it('READ: allowed for ALL six roles (non-sensitive shared catalog)', () => {
    for (const role of ALL_ROLES) {
      expect(can(role, 'read')).toBe(true);
    }
  });

  it('WRITE: SUPER_ADMIN/ADMIN/MANAGER allowed; ACCOUNTANT/ANALYST/VIEWER denied', () => {
    for (const action of ['create', 'update', 'delete'] as const) {
      expect(can(UserRole.SUPER_ADMIN, action)).toBe(true);
      expect(can(UserRole.ADMIN, action)).toBe(true);
      expect(can(UserRole.MANAGER, action)).toBe(true);
      expect(can(UserRole.ACCOUNTANT, action)).toBe(false);
      expect(can(UserRole.ANALYST, action)).toBe(false);
      expect(can(UserRole.VIEWER, action)).toBe(false);
    }
  });
});
