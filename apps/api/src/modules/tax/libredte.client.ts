import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class LibreDteClient {
  private readonly logger = new Logger(LibreDteClient.name);
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor() {
    this.baseUrl = (process.env.LIBREDTE_BASE_URL || 'https://libredte.cl/api').replace(/\/+$/, '');
    const credentials = Buffer.from(
      `${process.env.LIBREDTE_API_HASH || ''}:${process.env.LIBREDTE_API_KEY || ''}`,
    ).toString('base64');
    this.headers = {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
    };
  }

  async get<T = unknown>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const res = await fetch(url, {
      method,
      headers: this.headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.warn(`LibreDTE ${method} ${path} → ${res.status} ${text.slice(0, 400)}`);
      throw new Error(`LibreDTE ${res.status}: ${text.slice(0, 200) || res.statusText}`);
    }

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return (await res.json()) as T;
    }
    return (await res.text()) as unknown as T;
  }
}
