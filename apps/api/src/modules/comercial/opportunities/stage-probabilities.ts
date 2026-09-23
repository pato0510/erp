import { OpportunityStage, Prisma } from '@prisma/client';

// In pipeline order, including the two fixed outcomes last.
export const INITIAL_STAGE_PROBABILITIES: Record<OpportunityStage, number> = {
  PROSPECTO: 10,
  CONTACTO: 20,
  VISITA_TECNICA: 40,
  COTIZACION: 60,
  NEGOCIACION: 80,
  EN_PAUSA: 10,
  GANADA: 100,
  PERDIDA: 0,
};

export const EDITABLE_PROBABILITY_STAGES = Object.keys(INITIAL_STAGE_PROBABILITIES).filter(
  (stage) => stage !== 'GANADA' && stage !== 'PERDIDA',
) as OpportunityStage[];

export const PROBABILITY_MESSAGE = 'La probabilidad debe ser un múltiplo de 10 entre 0 y 100.';

type ProbabilityClient = Pick<Prisma.TransactionClient, 'opportunityStageProbability'>;

export async function loadStageProbabilities(
  client: ProbabilityClient,
  companyId: string,
): Promise<Record<OpportunityStage, number>> {
  const rows = await client.opportunityStageProbability.findMany({
    where: { companyId },
    select: { stage: true, probability: true },
  });
  const probabilities = { ...INITIAL_STAGE_PROBABILITIES };
  for (const row of rows) {
    if (EDITABLE_PROBABILITY_STAGES.includes(row.stage)) probabilities[row.stage] = row.probability;
  }
  return probabilities;
}
