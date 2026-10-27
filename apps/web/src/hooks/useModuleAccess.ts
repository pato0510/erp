'use client';

import { apiClient } from '../lib/api';
import { currentRestrictedModules, type AccessModule } from '../lib/moduleAccess';
import { useAuth } from './useAuth';

/* ACCESS-002 — the current membership's blocked modules, for hiding surfaces a restricted
   member cannot use (the api still enforces). Reads /auth/me through useAuth like every
   other gate in the web; returns [] while loading, so nothing is hidden before it is known
   and nothing restricted is shown once it is. */
export function useRestrictedModules(): {
  restricted: readonly AccessModule[];
  isRestricted: (module: AccessModule) => boolean;
  isLoading: boolean;
} {
  const { user, isLoading } = useAuth();
  const restricted = currentRestrictedModules(user, apiClient.getCompanyId());
  return {
    restricted,
    isRestricted: (module) => restricted.includes(module),
    isLoading,
  };
}
