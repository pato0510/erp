/* ACCESS-002 (2026-10-27) — per-membership module access, web side. INTERIM until real
   access profiles exist. The api is the authority (ACCESS-001: Membership.restrictedModules
   applied in CaslAbilityFactory AFTER the role → 403); the web only HIDES what a restricted
   member cannot use. Access is never inferred from the role: only from the membership list
   that /auth/me returns for the current company. */

export type AccessModule = 'FINANZAS' | 'RRHH';

export const ACCESS_MODULES: readonly AccessModule[] = ['FINANZAS', 'RRHH'];

/* The two interim profiles the founder decided (2026-10-27). */
export const RESTRICTED_PROFILE_MODULES: readonly AccessModule[] = ['FINANZAS', 'RRHH'];
export const ACCESS_PROFILE_LABELS = {
  all: 'Todos los módulos',
  restricted: 'Sin Finanzas ni Recursos Humanos',
} as const;
/* Short form for chips next to the role badge. */
export const RESTRICTED_PROFILE_CHIP = 'Sin Finanzas ni RRHH';

export const ACCESS_MODULE_LABELS: Record<AccessModule, string> = {
  FINANZAS: 'Finanzas',
  RRHH: 'Recursos Humanos',
};

/* Structural slice of the /auth/me payload (hooks/useAuth.ts) so this file stays a leaf. */
export interface MembershipAccessSource {
  companies: { companyId: string; restrictedModules?: readonly AccessModule[] }[];
}

/** Blocked modules of the membership in `companyId` (first membership when none is selected,
 *  mirroring currentCompanyRole). Empty while /auth/me loads or when nothing is blocked. */
export function currentRestrictedModules(
  me: MembershipAccessSource | null | undefined,
  companyId: string | null,
): readonly AccessModule[] {
  const membership = companyId
    ? me?.companies.find((c) => c.companyId === companyId)
    : me?.companies[0];
  return membership?.restrictedModules ?? [];
}

/* The Finanzas route set = the FinanceSidebar entries (components/sidebars/FinanceSidebar.tsx,
   `navItems`) minus /configuracion, which is SHARED. Keep both lists in step: a route added to
   that sidebar must be added here or a restricted member could open it. */
export const FINANZAS_ROUTE_PREFIXES: readonly string[] = [
  '/dashboard',
  '/movimientos',
  '/caja',
  '/banco',
  '/tributario',
  '/conciliacion',
  '/cierre',
  '/alertas',
  '/reportes',
  '/categorias',
  '/contrapartes',
];
export const RRHH_ROUTE_PREFIXES: readonly string[] = ['/rrhh'];
/* Reached from every module; the dashboard layout falls back to FinanceSidebar for them. */
export const SHARED_PREFIXES: readonly string[] = ['/configuracion', '/notificaciones'];

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** The module a dashboard route belongs to, or null (shared routes and every other module). */
export function moduleForPath(pathname: string | null | undefined): AccessModule | null {
  if (!pathname) return null;
  if (FINANZAS_ROUTE_PREFIXES.some((p) => matchesPrefix(pathname, p))) return 'FINANZAS';
  if (RRHH_ROUTE_PREFIXES.some((p) => matchesPrefix(pathname, p))) return 'RRHH';
  return null;
}

export function isSharedPath(pathname: string | null | undefined): boolean {
  return !!pathname && SHARED_PREFIXES.some((p) => matchesPrefix(pathname, p));
}

export function isModuleRestricted(
  restricted: readonly AccessModule[],
  module: AccessModule,
): boolean {
  return restricted.includes(module);
}

/** True when the member must not see `pathname` (its module is in their blocked list). */
export function isPathBlocked(
  pathname: string | null | undefined,
  restricted: readonly AccessModule[],
): boolean {
  const module = moduleForPath(pathname);
  return module !== null && restricted.includes(module);
}

/** Profile ⇄ list mapping used by the Usuarios form. Any non-empty list reads as the
 *  restricted profile; the form always writes the full interim pair. */
export function profileFromModules(
  modules: readonly AccessModule[] | undefined,
): 'all' | 'restricted' {
  return modules && modules.length > 0 ? 'restricted' : 'all';
}
export function modulesFromProfile(profile: 'all' | 'restricted'): AccessModule[] {
  return profile === 'restricted' ? [...RESTRICTED_PROFILE_MODULES] : [];
}
