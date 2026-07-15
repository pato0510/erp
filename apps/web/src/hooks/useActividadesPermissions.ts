'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '../lib/api';

/* CAL-002 — Actividades write-gating driven by the CALLER'S CASL ABILITY, not a hardcoded
   role list. The backend (GET /api/actividades/permissions) computes these flags from the
   same ability PoliciesGuard builds, so the UI can never drift from the CASL matrix. Mirrors
   the Marketing hook EXACTLY (same shape, same session/company-scoped cache, same all-false-
   on-error default). NOTE: unlike Marketing, a 403 never happens here — read is granted to
   ALL six roles (Part 1 §4), so every role gets real flags; the all-false fallback only
   covers a genuine network error. CAL-005/006 reuse these hooks. */

export interface SubjectFlags {
  read: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
}
export interface ActividadesPermissions {
  calendarActivity: SubjectFlags; // CAL-003/005 — the calendar + activity forms gate on this
  activityArea: SubjectFlags; // CAL-002 — the areas config screen gates on this
}
export type ActividadesSubject = keyof ActividadesPermissions;

const NONE: SubjectFlags = { read: false, create: false, update: false, delete: false };
const EMPTY: ActividadesPermissions = {
  calendarActivity: NONE,
  activityArea: NONE,
};

/* Session/company-scoped cache: one fetch per company, shared across every hook instance. */
const cache = new Map<string, Promise<ActividadesPermissions>>();

function loadPermissions(companyId: string): Promise<ActividadesPermissions> {
  let p = cache.get(companyId);
  if (!p) {
    p = apiClient.get<ActividadesPermissions>('/api/actividades/permissions').catch(() => EMPTY);
    cache.set(companyId, p);
  }
  return p;
}

/** The full per-subject flag set for the active company (null while loading). */
export function useActividadesPermissions(): ActividadesPermissions | null {
  const companyId = apiClient.getCompanyId();
  const [perms, setPerms] = useState<ActividadesPermissions | null>(null);

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
 * CAL-002 — cosmetic write-gate. Returns whether the caller may perform ANY write
 * (create/update/delete) on the given Actividades subject (default 'calendarActivity').
 * Returns false while flags load. Real enforcement is always the backend @CheckPolicies.
 */
export function useCanWriteActividades(subject: ActividadesSubject = 'calendarActivity'): boolean {
  const perms = useActividadesPermissions();
  if (!perms) return false;
  const f = perms[subject];
  return f.create || f.update || f.delete;
}
