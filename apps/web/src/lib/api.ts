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
      throw new ApiError(error.message || `HTTP ${res.status}`, res.status, error);
    }
    return res.json();
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
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.blob();
  }
}

export const apiClient = new ApiClient();
