/** One resolution path for movement responses, categorization and exports. */
export interface CounterpartyFactSource {
  name?: string | null;
  taxId?: string | null;
  giro?: string | null;
}

export function resolveCounterpartyFacts(counterparty: CounterpartyFactSource | null | undefined) {
  return {
    name: counterparty?.name?.trim() || null,
    rut: counterparty?.taxId?.trim() || null,
    giro: counterparty?.giro?.trim() || null,
  };
}
