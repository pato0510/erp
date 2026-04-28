import { DocumentCriticality, PermitCategory } from '@prisma/client';

/* OPS-024 — recommended catalog for Chilean operations. The seed
   endpoint inserts these into permit_types when the user clicks
   "Cargar tipos chilenos por defecto" on the configuration tab.
   Existing rows (matched by code) are skipped to keep the seed
   idempotent. */

export interface PermitTypeSeed {
  code: string;
  name: string;
  category: PermitCategory;
  issuingAuthority: string | null;
  hasExpiration: boolean;
  defaultValidityDays: number | null;
  alertDaysBefore: number;
  criticality: DocumentCriticality;
  blocksOperation: boolean;
  icon: string | null;
  color: string | null;
}

export const DEFAULT_PERMIT_TYPES_CHILE: PermitTypeSeed[] = [
  {
    code: 'PMUN',
    name: 'Patente Municipal',
    category: 'MUNICIPAL',
    issuingAuthority: 'Municipalidad',
    hasExpiration: true,
    defaultValidityDays: 365,
    alertDaysBefore: 60,
    criticality: 'HIGH',
    blocksOperation: true,
    icon: 'Building2',
    color: '#3B82F6',
  },
  {
    code: 'AUTSAN',
    name: 'Autorización Sanitaria',
    category: 'SANITARY',
    issuingAuthority: 'SEREMI de Salud',
    hasExpiration: true,
    defaultValidityDays: 1095,
    alertDaysBefore: 90,
    criticality: 'CRITICAL',
    blocksOperation: true,
    icon: 'Shield',
    color: '#10B981',
  },
  {
    code: 'RCA',
    name: 'Resolución de Calificación Ambiental',
    category: 'ENVIRONMENTAL',
    issuingAuthority: 'SEA',
    hasExpiration: false,
    defaultValidityDays: null,
    alertDaysBefore: 30,
    criticality: 'CRITICAL',
    blocksOperation: true,
    icon: 'Leaf',
    color: '#059669',
  },
  {
    code: 'PBOMB',
    name: 'Permiso de Bomberos',
    category: 'FIRE_DEPT',
    issuingAuthority: 'Cuerpo de Bomberos',
    hasExpiration: true,
    defaultValidityDays: 365,
    alertDaysBefore: 60,
    criticality: 'HIGH',
    blocksOperation: true,
    icon: 'Flame',
    color: '#EF4444',
  },
  {
    code: 'DOM',
    name: 'Recepción Definitiva DOM',
    category: 'MUNICIPAL',
    issuingAuthority: 'Dirección de Obras Municipales',
    hasExpiration: false,
    defaultValidityDays: null,
    alertDaysBefore: 30,
    criticality: 'HIGH',
    blocksOperation: false,
    icon: 'FileCheck',
    color: '#6366F1',
  },
  {
    code: 'DEC180',
    name: 'DS 180 Eléctrico',
    category: 'ELECTRICAL',
    issuingAuthority: 'SEC',
    hasExpiration: false,
    defaultValidityDays: null,
    alertDaysBefore: 30,
    criticality: 'HIGH',
    blocksOperation: false,
    icon: 'Zap',
    color: '#F59E0B',
  },
  {
    code: 'REGEN',
    name: 'Registro Generador de Residuos',
    category: 'ENVIRONMENTAL',
    issuingAuthority: 'Ministerio de Salud',
    hasExpiration: true,
    defaultValidityDays: 730,
    alertDaysBefore: 90,
    criticality: 'MEDIUM',
    blocksOperation: false,
    icon: 'Recycle',
    color: '#14B8A6',
  },
];
