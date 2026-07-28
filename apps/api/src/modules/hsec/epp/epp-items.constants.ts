/* HSEC-008 — the default Chilean EPP catalog, seeded on demand via
   POST /hsec/epp-items/seed-defaults (idempotent upsert on (companyId, name) — the OPS-004
   DEFAULT_DOCUMENT_TYPES pattern, document-types.constants.ts). Names are display strings;
   admins can rename/extend their company's catalog freely afterwards. */
export const DEFAULT_EPP_ITEMS: string[] = [
  'Casco',
  'Lentes de seguridad',
  'Guantes',
  'Calzado de seguridad',
  'Chaleco reflectante',
  'Protector auditivo',
  'Respirador',
  'Arnés',
];
