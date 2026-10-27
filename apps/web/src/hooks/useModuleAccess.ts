'use client';

import { apiClient } from '../lib/api';
import { currentRestrictedModules, type AccessModule } from '../lib/moduleAccess';
import { useAuth } from './useAuth';

/* ACCESS-002 — the current membership's blocked modules, for hiding surfaces a restricted
   member cannot use (the api still enforces). useAuth is PER INSTANCE (each call fetches
   /auth/me with its own state), so `restricted` is [] until that fetch resolves. A surface
   that hides Finanzas/RRHH content must therefore treat "loading" as HIDDEN and gate on
   `canSee(module)` (= loaded and not restricted), never on `!isRestricted(module)` alone:
   otherwise the Finanzas widget mounts, fires its request and the restricted member gets a
   403 before the answer arrives. */
export function useRestrictedModules(): {
  restricted: readonly AccessModule[];
  isLoading: boolean;
  /** True once /auth/me resolved with this module in the blocked list. */
  isRestricted: (module: AccessModule) => boolean;
  /** True only when access is KNOWN and the module is not blocked — the gate for showing. */
  canSee: (module: AccessModule) => boolean;
} {
  const { user, isLoading } = useAuth();
  const restricted = currentRestrictedModules(user, apiClient.getCompanyId());
  const isRestricted = (module: AccessModule) => restricted.includes(module);
  return {
    restricted,
    isLoading,
    isRestricted,
    canSee: (module) => !isLoading && !isRestricted(module),
  };
}
