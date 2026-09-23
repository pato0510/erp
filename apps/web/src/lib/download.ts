import { redirectIfPasswordChangeRequired } from './api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function downloadFile(path: string, filename: string): Promise<void> {
  const companyId =
    typeof window !== 'undefined' ? localStorage.getItem('selectedCompanyId') : null;

  const headers: Record<string, string> = {};
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
      redirectIfPasswordChangeRequired(res.status, await res.json().catch(() => null));
    }
    throw new Error(`Download failed: ${res.status}`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
