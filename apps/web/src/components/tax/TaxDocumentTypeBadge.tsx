'use client';

export type TaxDocumentType =
  | 'FACTURA_ELECTRONICA'
  | 'BOLETA_ELECTRONICA'
  | 'NOTA_CREDITO'
  | 'NOTA_DEBITO'
  | 'LIQUIDACION_FACTURA'
  | 'FACTURA_NO_AFECTA';

const LABELS: Record<TaxDocumentType, { label: string; cls: string }> = {
  FACTURA_ELECTRONICA: {
    label: 'Factura Electrónica',
    cls: 'bg-blue-100 text-blue-700',
  },
  BOLETA_ELECTRONICA: {
    label: 'Boleta',
    cls: 'bg-purple-100 text-purple-700',
  },
  NOTA_CREDITO: {
    label: 'Nota de Crédito',
    cls: 'bg-green-100 text-green-700',
  },
  NOTA_DEBITO: {
    label: 'Nota de Débito',
    cls: 'bg-orange-100 text-orange-700',
  },
  LIQUIDACION_FACTURA: {
    label: 'Liquidación Factura',
    cls: 'bg-indigo-100 text-indigo-700',
  },
  FACTURA_NO_AFECTA: {
    label: 'Factura no Afecta',
    cls: 'bg-cyan-100 text-cyan-700',
  },
};

export function TaxDocumentTypeBadge({ type }: { type: string }) {
  const entry = LABELS[type as TaxDocumentType] ?? {
    label: type,
    cls: 'bg-gray-100 text-gray-700',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${entry.cls}`}
    >
      {entry.label}
    </span>
  );
}

export function taxDocumentTypeLabel(type: string): string {
  return LABELS[type as TaxDocumentType]?.label ?? type;
}
