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

  if (!res.ok) {
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
