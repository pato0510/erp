'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '../lib/api';

/* MKT-003 — Marketing write-gating driven by the CALLER'S CASL ABILITY, not a
   hardcoded role list. The backend (GET /api/marketing/permissions) computes these
   flags from the same ability PoliciesGuard builds, so the UI can never drift from
   the CASL matrix. Mirrors the Comercial useCanWrite hook EXACTLY (same shape, same
   session/company-scoped cache, same all-false-on-error default). */

export interface SubjectFlags {
  read: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
}
export interface MarketingPermissions {
  campaign: SubjectFlags; // MKT-002/003 — campaigns list/form/detail + status actions gate on this
  marketingExpense: SubjectFlags; // MKT-005 — the expenses section gates on this
  presenceSnapshot: SubjectFlags; // MKT-008/009 — the presence dashboard gates on this
}
export type MarketingSubject = keyof MarketingPermissions;

const NONE: SubjectFlags = { read: false, create: false, update: false, delete: false };
const EMPTY: MarketingPermissions = {
  campaign: NONE,
  marketingExpense: NONE,
  presenceSnapshot: NONE,
};

/* Session/company-scoped cache: one fetch per company, shared across every hook
   instance (list + detail + form) so we don't re-fetch on each mount. A 403
   (ANALYST/VIEWER) or any error resolves to all-false — the safe default that hides
   write controls; those roles never reach the Marketing UI anyway. */
const cache = new Map<string, Promise<MarketingPermissions>>();

function loadPermissions(companyId: string): Promise<MarketingPermissions> {
  let p = cache.get(companyId);
  if (!p) {
    p = apiClient.get<MarketingPermissions>('/api/marketing/permissions').catch(() => EMPTY);
    cache.set(companyId, p);
  }
  return p;
}

/** The full per-subject flag set for the active company (null while loading). */
export function useMarketingPermissions(): MarketingPermissions | null {
  const companyId = apiClient.getCompanyId();
  const [perms, setPerms] = useState<MarketingPermissions | null>(null);

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
 * MKT-003 — cosmetic write-gate. Returns whether the caller may perform ANY write
 * (create/update/delete) on the given Marketing subject (default 'campaign'). Returns
 * false while flags load (buttons stay hidden until the answer is known). Real
 * enforcement is always the backend @CheckPolicies. Mirrors Comercial's useCanWrite.
 */
export function useCanWriteMarketing(subject: MarketingSubject = 'campaign'): boolean {
  const perms = useMarketingPermissions();
  if (!perms) return false;
  const f = perms[subject];
  return f.create || f.update || f.delete;
}
