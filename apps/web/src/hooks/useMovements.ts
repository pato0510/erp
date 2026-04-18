'use client';

import { apiClient } from '../lib/api';

interface Movement {
  id: string;
  type: string;
  status: string;
  amount: string;
  date: string;
  description: string;
  reference?: string;
  category: { id: string; name: string; color: string };
  counterparty?: { id: string; name: string };
  costCenter?: { id: string; name: string };
  fiscalPeriod: { id: string; name: string };
}

interface PaginatedMovements {
  data: Movement[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface MovementFilters {
  type?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  limit?: number;
}

interface ImportResult {
  created: number;
  skipped: number;
  errors: { row: number; field: string; message: string }[];
}

interface PreviewResult {
  validCount: number;
  errorCount: number;
  errors: { row: number; field: string; message: string }[];
  preview: { date: string; type: string; amount: number; description: string }[];
}

export function useMovements() {
  const fetchMovements = async (filters: MovementFilters = {}): Promise<PaginatedMovements> => {
    const params = new URLSearchParams();
    if (filters.type) params.set('type', filters.type);
    if (filters.status) params.set('status', filters.status);
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params.set('dateTo', filters.dateTo);
    if (filters.search) params.set('search', filters.search);
    if (filters.page) params.set('page', String(filters.page));
    if (filters.limit) params.set('limit', String(filters.limit));
    const qs = params.toString();
    return apiClient.get<PaginatedMovements>(`/api/movements${qs ? `?${qs}` : ''}`);
  };

  const createMovement = async (dto: Record<string, unknown>): Promise<Movement> => {
    return apiClient.post<Movement>('/api/movements', dto);
  };

  const confirmMovement = async (id: string): Promise<Movement> => {
    return apiClient.post<Movement>(`/api/movements/${id}/confirm`);
  };

  const cancelMovement = async (id: string, reason?: string): Promise<Movement> => {
    return apiClient.post<Movement>(`/api/movements/${id}/cancel`, { reason });
  };

  const previewImport = async (file: File): Promise<PreviewResult> => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.uploadFile<PreviewResult>('/api/movements/import/preview', formData);
  };

  const importMovements = async (file: File, fiscalPeriodId: string): Promise<ImportResult> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('fiscalPeriodId', fiscalPeriodId);
    return apiClient.uploadFile<ImportResult>('/api/movements/import', formData);
  };

  return {
    fetchMovements,
    createMovement,
    confirmMovement,
    cancelMovement,
    previewImport,
    importMovements,
  };
}
