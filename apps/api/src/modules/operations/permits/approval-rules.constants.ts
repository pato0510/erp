/* OPS-026 — recommended approval chains for both work and external
   permit catalogs. Seeded via POST /api/operations/approval-steps/
   apply-defaults. Codes correspond to the Chilean defaults seeded by
   OPS-024 (PermitType) and OPS-025 (WorkPermitType). The seeder is
   idempotent against (companyId, target_type_id, stepOrder), so
   re-running adds whatever's missing without touching existing rows. */

export interface DefaultApprovalChainStep {
  stepOrder: number;
  name: string;
  description?: string;
  roles: string[];
  mustBeDifferentFromRequester?: boolean;
  mustBeDifferentFromPreviousApprovers?: boolean;
}

export const DEFAULT_WORK_PERMIT_APPROVAL_CHAINS: Record<string, DefaultApprovalChainStep[]> = {
  'PT-ALT': [
    { stepOrder: 1, name: 'Autorización Supervisor', roles: ['MANAGER'] },
    { stepOrder: 2, name: 'Autorización Prevención', roles: ['MANAGER'] },
  ],
  'PT-CAL': [{ stepOrder: 1, name: 'Autorización Supervisor', roles: ['MANAGER'] }],
  'PT-EC': [
    { stepOrder: 1, name: 'Autorización Supervisor', roles: ['MANAGER'] },
    { stepOrder: 2, name: 'Autorización Prevención', roles: ['MANAGER'] },
    { stepOrder: 3, name: 'Autorización Gerencia', roles: ['ADMIN'] },
  ],
  'PT-LOTO': [
    { stepOrder: 1, name: 'Autorización Supervisor', roles: ['MANAGER'] },
    { stepOrder: 2, name: 'Autorización Mantenimiento', roles: ['MANAGER'] },
  ],
  'PT-EXC': [{ stepOrder: 1, name: 'Autorización Supervisor', roles: ['MANAGER'] }],
  'PT-IZJ': [
    { stepOrder: 1, name: 'Autorización Operaciones', roles: ['MANAGER'] },
    { stepOrder: 2, name: 'Autorización Prevención', roles: ['MANAGER'] },
  ],
};

export const DEFAULT_EXTERNAL_PERMIT_APPROVAL_CHAINS: Record<string, DefaultApprovalChainStep[]> = {
  PMUN: [{ stepOrder: 1, name: 'Validación documental', roles: ['MANAGER'] }],
  AUTSAN: [
    { stepOrder: 1, name: 'Validación HSEC', roles: ['MANAGER'] },
    { stepOrder: 2, name: 'Aprobación gerencial', roles: ['ADMIN'] },
  ],
  RCA: [
    { stepOrder: 1, name: 'Validación HSEC', roles: ['MANAGER'] },
    { stepOrder: 2, name: 'Aprobación gerencial', roles: ['ADMIN'] },
  ],
};
