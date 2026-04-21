const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

class ApiClient {
  private companyId: string | null = null;

  setCompanyId(id: string) {
    this.companyId = id;
    if (typeof window !== 'undefined') {
      localStorage.setItem('selectedCompanyId', id);
    }
  }

  getCompanyId(): string | null {
    if (this.companyId) return this.companyId;
    if (typeof window !== 'undefined') {
      return localStorage.getItem('selectedCompanyId');
    }
    return null;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };

    const companyId = this.getCompanyId();
    if (companyId) {
      headers['x-company-id'] = companyId;
    }

    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      credentials: 'include',
    });

    if (res.status === 401) {
      if (typeof window !== 'undefined' && !path.includes('/auth/login')) {
        window.location.href = '/login';
      }
      throw new Error('Unauthorized');
    }

    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || `HTTP ${res.status}`);
    }

    if (res.headers.get('content-type')?.includes('application/json')) {
      return res.json();
    }
    return {} as T;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' });
  }

  async uploadFile<T>(path: string, formData: FormData): Promise<T> {
    const headers: Record<string, string> = {};
    const companyId = this.getCompanyId();
    if (companyId) headers['x-company-id'] = companyId;

    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers,
      body: formData,
      credentials: 'include',
    });

    if (res.status === 401) {
      if (typeof window !== 'undefined') window.location.href = '/login';
      throw new Error('Unauthorized');
    }
    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: 'Upload failed' }));
      throw new Error(error.message || `HTTP ${res.status}`);
    }
    return res.json();
  }
}

export const apiClient = new ApiClient();
