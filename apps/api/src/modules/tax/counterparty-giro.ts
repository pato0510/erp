import { DocumentDirection } from '@prisma/client';

/** BaseAPI preserves the source row in metadata.raw. Never use the company's
 * GiroEmis as a customer's giro on a sale: that party is the receiver. Missing
 * or non-text source data remains unknown, including RCV rows without giro. */
export function readCounterpartyGiro(
  metadata: unknown,
  direction: DocumentDirection,
): string | null {
  if (!metadata || typeof metadata !== 'object' || !('raw' in metadata)) return null;
  const raw = metadata.raw;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const key = direction === DocumentDirection.RECIBIDO ? 'giroemis' : 'girorecep';
  const value = Object.entries(raw).find(([name]) => name.toLowerCase() === key)?.[1];
  return typeof value === 'string' ? value.trim() || null : null;
}
