import { Injectable } from '@nestjs/common';
import { OpportunityStage, Prisma } from '@prisma/client';
import { RlsService } from '../../common/rls/rls.service';
import { UpdateStageProbabilitiesDto } from './dto/stage-probabilities.dto';
import { EDITABLE_PROBABILITY_STAGES, INITIAL_STAGE_PROBABILITIES } from './stage-probabilities';

@Injectable()
export class StageProbabilitiesService {
  constructor(private readonly rls: RlsService) {}

  findAll(companyId: string, userId: string) {
    return this.rls.executeWithRls(companyId, userId, (tx) => this.rows(tx, companyId));
  }

  update(companyId: string, userId: string, dto: UpdateStageProbabilitiesDto) {
    return this.rls.executeWithRls(companyId, userId, async (tx) => {
      for (const { stage, probability } of dto.items) {
        await tx.opportunityStageProbability.upsert({
          where: { companyId_stage: { companyId, stage } },
          create: { companyId, stage, probability, updatedBy: userId },
          update: { probability, updatedBy: userId },
        });
      }
      return this.rows(tx, companyId);
    });
  }

  private async rows(tx: Prisma.TransactionClient, companyId: string) {
    const rows = await tx.opportunityStageProbability.findMany({
      where: { companyId },
      select: { stage: true, probability: true },
    });
    const stored = new Map(rows.map((row) => [row.stage, row.probability]));
    return (Object.keys(INITIAL_STAGE_PROBABILITIES) as OpportunityStage[]).map((stage) => {
      const editable = EDITABLE_PROBABILITY_STAGES.includes(stage);
      const configured = editable ? stored.get(stage) : undefined;
      return {
        stage,
        probability: configured ?? INITIAL_STAGE_PROBABILITIES[stage],
        editable,
        isDefault: configured === undefined,
      };
    });
  }
}
