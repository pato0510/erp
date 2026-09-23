'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '../lib/api';

interface Company {
  companyId: string;
  companyName: string;
  taxId: string;
  role: string;
  membershipId: string;
}

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  companies: Company[];
  // AUTH-001 — true after an admin reset: only /cambiar-clave (and me/logout) work.
  mustChangePassword?: boolean;
}

// UI gating only: a selected company must never inherit another company's role.
export function currentCompanyRole(user: User | null | undefined, companyId: string | null) {
  return (
    companyId
      ? user?.companies.find((company) => company.companyId === companyId)
      : user?.companies[0]
  )?.role;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get<User>('/api/auth/me')
      .then((data) => {
        setUser(data);
        // AUTH-002 — a route that makes no other api call would never meet the coded 403,
        // so the flag itself bounces there too (same full navigation as api.ts).
        if (data.mustChangePassword && window.location.pathname !== '/cambiar-clave') {
          window.location.href = '/cambiar-clave';
        }
        if (data.companies.length > 0 && !apiClient.getCompanyId()) {
          apiClient.setCompanyId(data.companies[0].companyId);
        }
      })
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  const logout = async () => {
    await apiClient.post('/api/auth/logout').catch(() => undefined);
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  };

  return {
    user,
    companies: user?.companies || [],
    isLoading,
    logout,
  };
}
