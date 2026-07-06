'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '../lib/api';

/* COM-004b — write-gating driven by the CALLER'S CASL ABILITY, not a hardcoded
   role list. The backend (GET /api/comercial/permissions) computes these flags
   from the same ability PoliciesGuard builds, so the UI can never drift from the
   CASL matrix. */

export interface SubjectFlags {
  read: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
}
export interface ComercialPermissions {
  account: SubjectFlags;
  contact: SubjectFlags;
  opportunity: SubjectFlags; // COM-007 — the pipeline board gates on this
  activity: SubjectFlags; // COM-008 — the interaction timeline gates on this
  serviceCatalog: SubjectFlags;
}
export type ComercialSubject = keyof ComercialPermissions;

const NONE: SubjectFlags = { read: false, create: false, update: false, delete: false };
const EMPTY: ComercialPermissions = {
  account: NONE,
  contact: NONE,
  opportunity: NONE,
  activity: NONE,
  serviceCatalog: NONE,
};

/* Session/company-scoped cache: one fetch per company, shared across every hook
   instance (list + ficha + contacts tab) so we don't re-fetch on each mount. A
   403 (ANALYST/VIEWER) or any error resolves to all-false — the safe default that
   hides write controls; those roles never reach the Comercial UI anyway. */
const cache = new Map<string, Promise<ComercialPermissions>>();

function loadPermissions(companyId: string): Promise<ComercialPermissions> {
  let p = cache.get(companyId);
  if (!p) {
    p = apiClient.get<ComercialPermissions>('/api/comercial/permissions').catch(() => EMPTY);
    cache.set(companyId, p);
  }
  return p;
}

/** The full per-subject flag set for the active company (null while loading). */
export function useComercialPermissions(): ComercialPermissions | null {
  const companyId = apiClient.getCompanyId();
  const [perms, setPerms] = useState<ComercialPermissions | null>(null);

  useEffect(() => {
    if (!companyId) {
      setPerms(null);
      return;
    }
    let active = true;
    loadPermissions(companyId).then((p) => {
      if (active) setPerms(p);
    });
    return () => {
      active = false;
    };
  }, [companyId]);

  return perms;
}

/**
 * COM-004b — cosmetic write-gate. Returns whether the caller may perform ANY write
 * (create/update/delete) on the given Comercial subject (default 'account'). The
 * public API is unchanged — `useCanWrite()` still returns a boolean, so COM-004b
 * components are untouched — but the answer now derives from the server-computed
 * CASL ability, not a role-string list. Pass a subject (e.g. `useCanWrite('contact')`)
 * when a per-subject question is needed. Returns false while flags load (buttons
 * stay hidden until the answer is known), matching the previous async behaviour.
 * Real enforcement is always the backend @CheckPolicies.
 */
export function useCanWrite(subject: ComercialSubject = 'account'): boolean {
  const perms = useComercialPermissions();
  if (!perms) return false;
  const f = perms[subject];
  return f.create || f.update || f.delete;
}
