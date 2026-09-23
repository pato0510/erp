const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/* Error class used by the api client when an HTTP request fails. Carries the
   numeric status and parsed response body so callers can inspect domain-
   specific payloads (e.g. the 409 supersession-conflict envelope) without
   re-parsing the response. The `message` is the server's `message` when
   present so existing `instanceof Error` consumers keep working. */
export class ApiError<TData = unknown> extends Error {
  status: number;
  data: TData | null;
  constructor(message: string, status: number, data: TData | null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

/* AUTH-002 — AUTH-001's coded 403: while the account must change its password, every
   other authenticated call answers { code: 'PASSWORD_CHANGE_REQUIRED' }. Full navigation,
   like the 401 → /login below; no loop when the page is already /cambiar-clave. */
function redirectIfPasswordChangeRequired(status: number, body: unknown) {
  if (status !== 403 || typeof window === 'undefined') return;
  if ((body as { code?: unknown } | null)?.code !== 'PASSWORD_CHANGE_REQUIRED') return;
  if (window.location.pathname === '/cambiar-clave') return;
  window.location.href = '/cambiar-clave';
}

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
      redirectIfPasswordChangeRequired(res.status, error);
      throw new ApiError(error.message || `HTTP ${res.status}`, res.status, error);
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

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' });
  }

  async uploadFile<T>(path: string, formData: FormData, method = 'POST'): Promise<T> {
    const headers: Record<string, string> = {};
    const companyId = this.getCompanyId();
    if (companyId) headers['x-company-id'] = companyId;

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: formData,
      credentials: 'include',
    });

    if (res.status === 401) {
      if (typeof window !== 'undefined') window.location.href = '/login';
      throw new ApiError('Unauthorized', 401, null);
    }
    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: 'Upload failed' }));
      redirectIfPasswordChangeRequired(res.status, error);
      throw new ApiError(error.message || `HTTP ${res.status}`, res.status, error);
    }
    return res.json();
  }

  /* POST a JSON body and receive a Blob. Used by report exports
     (OPS-031) where filters are too rich for a query string. */
  async postBlob(path: string, body?: unknown): Promise<Blob> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const companyId = this.getCompanyId();
    if (companyId) headers['x-company-id'] = companyId;

    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'include',
    });
    if (res.status === 401) {
      if (typeof window !== 'undefined') window.location.href = '/login';
      throw new ApiError('Unauthorized', 401, null);
    }
    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: 'Download failed' }));
      redirectIfPasswordChangeRequired(res.status, error);
      throw new ApiError(error.message || `HTTP ${res.status}`, res.status, error);
    }
    return res.blob();
  }

  /* Fetches a binary endpoint with auth headers and returns a Blob.
     Used for thumbnails / inline images that the browser otherwise can't
     request because <img src> doesn't carry custom headers. */
  async fetchBlob(path: string): Promise<Blob> {
    const headers: Record<string, string> = {};
    const companyId = this.getCompanyId();
    if (companyId) headers['x-company-id'] = companyId;

    const res = await fetch(`${API_BASE}${path}`, {
      headers,
      credentials: 'include',
    });
    if (res.status === 401) {
      if (typeof window !== 'undefined') window.location.href = '/login';
      throw new Error('Unauthorized');
    }
    if (!res.ok) {
      if (res.status === 403) {
        redirectIfPasswordChangeRequired(403, await res.json().catch(() => null));
      }
      throw new Error(`HTTP ${res.status}`);
    }
    return res.blob();
  }
}

export const apiClient = new ApiClient();
