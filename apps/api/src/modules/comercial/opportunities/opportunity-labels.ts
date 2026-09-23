import { LostReason, OpportunityStage } from '@prisma/client';

// Shared API labels; existing system subjects must keep their exact wording.
export const STAGE_LABELS: Record<OpportunityStage, string> = {
  PROSPECTO: 'Prospecto',
  CONTACTO: 'Contacto',
  VISITA_TECNICA: 'Visita Técnica',
  COTIZACION: 'Cotización',
  NEGOCIACION: 'Negociación',
  EN_PAUSA: 'En Pausa',
  GANADA: 'Ganada',
  PERDIDA: 'Perdida',
};

export const LOST_REASON_LABELS: Record<LostReason, string> = {
  PRECIO: 'Precio',
  PLAZO: 'Plazo',
  COMPETENCIA: 'Competencia',
  SIN_RESPUESTA: 'Sin respuesta del cliente',
  PROYECTO_CANCELADO: 'Canceló el proyecto',
  OTRO: 'Otro',
};
