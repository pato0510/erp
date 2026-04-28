import { AlertSeverity } from '@prisma/client';

/* OPS-018 — recommended rule pack for Chilean operational fleets. Keyed
   by document-type CODE (matches what OPS-010 seeds for the Chilean
   pack: SOAP, PERMCIRC, REVTEC, plus the safety procedures we treat
   under code "PROC-SEG"). Each entry produces N AlertRule rows for the
   given document type. The PresetService skips entries whose code isn't
   present in the company's catalog. */

export interface RulePresetEntry {
  daysBeforeExpiration: number;
  severity: AlertSeverity;
  name: string;
  targetRoles: string[];
  notifyAssignedUser: boolean;
  notifyOperationalSupervisor: boolean;
  escalateAfterDays?: number;
  escalateToRoles?: string[];
}

export interface DocTypePreset {
  /* Match by uppercase code prefix — `code.toUpperCase().startsWith(prefix)`
     so codes like "SOAP-AUTO" still match the SOAP preset. */
  codePrefixes: string[];
  description: string;
  rules: RulePresetEntry[];
}

const SOAP_PRESET: DocTypePreset = {
  codePrefixes: ['SOAP'],
  description: 'Seguro Obligatorio de Accidentes Personales — pack recomendado Chile.',
  rules: [
    {
      daysBeforeExpiration: 60,
      severity: 'WARNING',
      name: 'SOAP — alerta 60 días',
      targetRoles: ['ADMIN', 'MANAGER'],
      notifyAssignedUser: false,
      notifyOperationalSupervisor: false,
    },
    {
      daysBeforeExpiration: 30,
      severity: 'WARNING',
      name: 'SOAP — alerta 30 días',
      targetRoles: ['ADMIN', 'MANAGER'],
      notifyAssignedUser: true,
      notifyOperationalSupervisor: false,
    },
    {
      daysBeforeExpiration: 15,
      severity: 'CRITICAL',
      name: 'SOAP — crítica 15 días',
      targetRoles: ['ADMIN', 'MANAGER'],
      notifyAssignedUser: true,
      notifyOperationalSupervisor: true,
    },
    {
      daysBeforeExpiration: 7,
      severity: 'CRITICAL',
      name: 'SOAP — crítica 7 días',
      targetRoles: ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'ANALYST'],
      notifyAssignedUser: true,
      notifyOperationalSupervisor: true,
    },
    {
      daysBeforeExpiration: 0,
      severity: 'BLOCKING',
      name: 'SOAP — bloqueo en vencimiento',
      targetRoles: ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'ANALYST'],
      notifyAssignedUser: true,
      notifyOperationalSupervisor: true,
      escalateAfterDays: 1,
      escalateToRoles: ['ADMIN'],
    },
  ],
};

const PERMCIRC_PRESET: DocTypePreset = {
  codePrefixes: ['PERMCIRC', 'PERM-CIRC'],
  description: 'Permiso de Circulación — mismo patrón que SOAP.',
  rules: SOAP_PRESET.rules.map((r) => ({
    ...r,
    name: r.name.replace('SOAP', 'Permiso Circulación'),
  })),
};

const REVTEC_PRESET: DocTypePreset = {
  codePrefixes: ['REVTEC', 'REV-TEC'],
  description: 'Revisión Técnica — ventana de aviso más larga.',
  rules: [
    {
      daysBeforeExpiration: 90,
      severity: 'WARNING',
      name: 'Revisión Técnica — alerta 90 días',
      targetRoles: ['ADMIN', 'MANAGER'],
      notifyAssignedUser: false,
      notifyOperationalSupervisor: false,
    },
    {
      daysBeforeExpiration: 30,
      severity: 'WARNING',
      name: 'Revisión Técnica — alerta 30 días',
      targetRoles: ['ADMIN', 'MANAGER'],
      notifyAssignedUser: true,
      notifyOperationalSupervisor: false,
    },
    {
      daysBeforeExpiration: 7,
      severity: 'CRITICAL',
      name: 'Revisión Técnica — crítica 7 días',
      targetRoles: ['ADMIN', 'MANAGER'],
      notifyAssignedUser: true,
      notifyOperationalSupervisor: true,
    },
    {
      daysBeforeExpiration: 0,
      severity: 'BLOCKING',
      name: 'Revisión Técnica — bloqueo en vencimiento',
      targetRoles: ['ADMIN', 'MANAGER'],
      notifyAssignedUser: true,
      notifyOperationalSupervisor: true,
      escalateAfterDays: 1,
      escalateToRoles: ['ADMIN'],
    },
  ],
};

const SAFETY_PROCEDURE_PRESET: DocTypePreset = {
  codePrefixes: ['PROC', 'SEG', 'PROCSEG', 'PROC-SEG'],
  description: 'Procedimientos de seguridad — vigencia anual habitual.',
  rules: [
    {
      daysBeforeExpiration: 30,
      severity: 'WARNING',
      name: 'Procedimiento de seguridad — alerta 30 días',
      targetRoles: ['ADMIN', 'MANAGER'],
      notifyAssignedUser: true,
      notifyOperationalSupervisor: false,
    },
    {
      daysBeforeExpiration: 7,
      severity: 'CRITICAL',
      name: 'Procedimiento de seguridad — crítica 7 días',
      targetRoles: ['ADMIN', 'MANAGER'],
      notifyAssignedUser: true,
      notifyOperationalSupervisor: true,
    },
  ],
};

export const RECOMMENDED_PRESETS: DocTypePreset[] = [
  SOAP_PRESET,
  PERMCIRC_PRESET,
  REVTEC_PRESET,
  SAFETY_PROCEDURE_PRESET,
];
