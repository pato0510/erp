import { DocumentCategory, DocumentCriticality } from '@prisma/client';

/* Default Chilean document types seeded on demand via the
   POST /document-types/seed-defaults admin endpoint. The catalog covers the
   most common operational/legal documents that fleet and equipment owners
   in Chile have to keep current. */
export interface DefaultDocumentTypeSeed {
  code: string;
  name: string;
  category: DocumentCategory;
  criticality: DocumentCriticality;
  blocksOperation: boolean;
  hasExpiration: boolean;
  defaultValidityDays?: number;
  alertDaysBefore?: number;
  criticalAlertDaysBefore?: number;
}

/* The four documents the law in Chile requires to circulate any vehicle. The
   AssetTypesService applies these as DocumentRequirements automatically when a
   VEHICLE-category AssetType is created (or on demand via the
   /apply-vehicle-defaults endpoint). The codes must match entries in
   DEFAULT_DOCUMENT_TYPES below. */
export const VEHICLE_DEFAULT_DOCUMENT_CODES = ['SOAP', 'PERMCIRC', 'REVTEC', 'PADRON'] as const;
export type VehicleDefaultDocumentCode = (typeof VEHICLE_DEFAULT_DOCUMENT_CODES)[number];

export const DEFAULT_DOCUMENT_TYPES: DefaultDocumentTypeSeed[] = [
  // LEGAL — every LEGAL doc is CRITICAL and blocks operation if missing/expired.
  {
    code: 'PERMCIRC',
    name: 'Permiso de Circulación',
    category: 'LEGAL',
    criticality: 'CRITICAL',
    blocksOperation: true,
    hasExpiration: true,
    defaultValidityDays: 365,
    alertDaysBefore: 30,
    criticalAlertDaysBefore: 7,
  },
  {
    code: 'SOAP',
    name: 'SOAP',
    category: 'LEGAL',
    criticality: 'CRITICAL',
    blocksOperation: true,
    hasExpiration: true,
    defaultValidityDays: 365,
    alertDaysBefore: 30,
    criticalAlertDaysBefore: 7,
  },
  {
    code: 'REVTEC',
    name: 'Revisión Técnica',
    category: 'LEGAL',
    criticality: 'CRITICAL',
    blocksOperation: true,
    hasExpiration: true,
    defaultValidityDays: 365,
    alertDaysBefore: 30,
    criticalAlertDaysBefore: 7,
  },
  {
    code: 'PADRON',
    name: 'Padrón',
    category: 'LEGAL',
    criticality: 'CRITICAL',
    blocksOperation: true,
    hasExpiration: false,
  },

  // SAFETY — HIGH criticality. Don't block operation by default; ops decides.
  {
    code: 'ANROC',
    name: 'Análisis de Riesgo',
    category: 'SAFETY',
    criticality: 'HIGH',
    blocksOperation: false,
    hasExpiration: true,
    defaultValidityDays: 365,
    alertDaysBefore: 30,
    criticalAlertDaysBefore: 7,
  },
  {
    code: 'PROCSEG',
    name: 'Procedimiento de Seguridad',
    category: 'SAFETY',
    criticality: 'HIGH',
    blocksOperation: false,
    hasExpiration: false,
  },
  {
    code: 'CAPOP',
    name: 'Capacitación Operador',
    category: 'SAFETY',
    criticality: 'HIGH',
    blocksOperation: false,
    hasExpiration: true,
    defaultValidityDays: 365,
    alertDaysBefore: 30,
    criticalAlertDaysBefore: 7,
  },

  // OPERATIONAL — MEDIUM criticality, no expiration by default.
  {
    code: 'MANOP',
    name: 'Manual de Operación',
    category: 'OPERATIONAL',
    criticality: 'MEDIUM',
    blocksOperation: false,
    hasExpiration: false,
  },
  {
    code: 'PLANMTO',
    name: 'Plan de Mantenimiento',
    category: 'OPERATIONAL',
    criticality: 'MEDIUM',
    blocksOperation: false,
    hasExpiration: false,
  },
  {
    code: 'BITOP',
    name: 'Bitácora Operacional',
    category: 'OPERATIONAL',
    criticality: 'MEDIUM',
    blocksOperation: false,
    hasExpiration: false,
  },

  // TECHNICAL — MEDIUM criticality, no expiration.
  {
    code: 'FICHATEC',
    name: 'Ficha Técnica',
    category: 'TECHNICAL',
    criticality: 'MEDIUM',
    blocksOperation: false,
    hasExpiration: false,
  },
  {
    code: 'ESPEC',
    name: 'Especificaciones',
    category: 'TECHNICAL',
    criticality: 'MEDIUM',
    blocksOperation: false,
    hasExpiration: false,
  },
];
