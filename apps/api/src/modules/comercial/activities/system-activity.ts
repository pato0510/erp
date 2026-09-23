import { ActivityType, CommercialActivityEvent, Prisma } from '@prisma/client';

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  LLAMADA: 'Llamada',
  REUNION: 'Reunión',
  EMAIL: 'Correo',
  VISITA_FAENA: 'Visita técnica',
  NOTA: 'Nota',
};

const clpFormatter = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

export function formatCLP(value: Prisma.Decimal | number): string {
  return clpFormatter.format(Number(value));
}

/** @db.Date uses its UTC civil day, never the server's local timezone. */
export function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10).split('-').reverse().join('-');
}

/** Only internal callers can mint immutable system actions, on their mutation's tx. */
export function writeSystemActivity(
  tx: Prisma.TransactionClient,
  p: {
    companyId: string;
    accountId: string;
    opportunityId: string | null;
    userId: string;
    event: CommercialActivityEvent;
    subject: string;
    detail?: string | null;
  },
) {
  return tx.activity.create({
    data: {
      companyId: p.companyId,
      accountId: p.accountId,
      opportunityId: p.opportunityId,
      createdBy: p.userId,
      type: ActivityType.NOTA,
      subject: p.subject,
      detail: p.detail ?? null,
      isSystemGenerated: true,
      systemEvent: p.event,
      status: null,
      statusChangedAt: null,
      activityDate: new Date(),
    },
  });
}
