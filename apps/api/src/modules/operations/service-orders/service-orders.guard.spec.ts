/* COM-013a + COM-013 tightening — proves the ServiceOrder authorization matrix. READ is
 * the FINANCIAL-visibility audience: SUPER_ADMIN/ADMIN/MANAGER/ACCOUNTANT read; ANALYST
 * and VIEWER are EXCLUDED because service orders carry contract money amounts (net/tax/
 * total) and, per policy, ANALYST/VIEWER never see monetary values (same as QuoteSubject
 * in Comercial). WRITE (update: general edit + the status machine) is the management
 * audience only (MANAGER/ADMIN/SUPER_ADMIN) — mirrors OperationalAsset write; ACCOUNTANT/
 * ANALYST/VIEWER cannot write. No role gets `create` (orders are born from the handoff). */
import { UserRole } from '@prisma/client';
import { CaslAbilityFactory, ServiceOrderSubject } from '../../common/casl/casl-ability.factory';

describe('COM-013a ServiceOrder authorization matrix', () => {
  const factory = new CaslAbilityFactory();
  const can = (role: UserRole, action: 'read' | 'create' | 'update') =>
    factory.defineAbilityFor(role).can(action, ServiceOrderSubject);

  it('READ: SUPER_ADMIN/ADMIN/MANAGER/ACCOUNTANT allowed; ANALYST/VIEWER excluded (money amounts)', () => {
    expect(can(UserRole.SUPER_ADMIN, 'read')).toBe(true);
    expect(can(UserRole.ADMIN, 'read')).toBe(true);
    expect(can(UserRole.MANAGER, 'read')).toBe(true);
    expect(can(UserRole.ACCOUNTANT, 'read')).toBe(true); // financial visibility (like Quotes/Accounts)
    expect(can(UserRole.ANALYST, 'read')).toBe(false); // never sees monetary values
    expect(can(UserRole.VIEWER, 'read')).toBe(false); // never sees monetary values
  });

  it('UPDATE (status machine + general edit): SUPER_ADMIN/ADMIN/MANAGER only', () => {
    expect(can(UserRole.SUPER_ADMIN, 'update')).toBe(true);
    expect(can(UserRole.ADMIN, 'update')).toBe(true);
    expect(can(UserRole.MANAGER, 'update')).toBe(true);
    expect(can(UserRole.ACCOUNTANT, 'update')).toBe(false); // reads orders, cannot advance them
    expect(can(UserRole.ANALYST, 'update')).toBe(false);
    expect(can(UserRole.VIEWER, 'update')).toBe(false);
  });

  it('CREATE: only SA/ADMIN via manage-all (no user endpoint); MANAGER/others cannot create', () => {
    expect(can(UserRole.SUPER_ADMIN, 'create')).toBe(true); // manage all (no endpoint exists)
    expect(can(UserRole.ADMIN, 'create')).toBe(true);
    expect(can(UserRole.MANAGER, 'create')).toBe(false); // orders are born from the handoff
    expect(can(UserRole.ACCOUNTANT, 'create')).toBe(false);
    expect(can(UserRole.ANALYST, 'create')).toBe(false);
    expect(can(UserRole.VIEWER, 'create')).toBe(false);
  });
});
