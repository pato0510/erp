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
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get<User>('/api/auth/me')
      .then((data) => {
        setUser(data);
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
