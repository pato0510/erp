/* OPS-033 — DTOs for the commitment template surface. Permissive
   on purpose: the controller validates that exactly one of
   documentTypeId / permitTypeId is populated and the service
   re-checks before persisting. */

export interface CreateCommitmentTemplateDto {
  documentTypeId?: string;
  permitTypeId?: string;
  categoryId: string;
  description: string;
  estimatedAmount: number | string;
  currency?: string;
  daysBeforeExpiration?: number;
  isActive?: boolean;
}

export interface UpdateCommitmentTemplateDto {
  categoryId?: string;
  description?: string;
  estimatedAmount?: number | string;
  currency?: string;
  daysBeforeExpiration?: number;
  isActive?: boolean;
}

export interface FilterCommitmentTemplatesDto {
  /* "documents" → only doc templates, "permits" → only permit
     templates, undefined / "all" → both. */
  scope?: 'documents' | 'permits' | 'all';
  isActive?: boolean;
}
