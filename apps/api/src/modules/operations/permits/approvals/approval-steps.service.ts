import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RlsService } from '../../../common/rls/rls.service';
import {
  DEFAULT_EXTERNAL_PERMIT_APPROVAL_CHAINS,
  DEFAULT_WORK_PERMIT_APPROVAL_CHAINS,
  DefaultApprovalChainStep,
} from '../approval-rules.constants';
import { CreateApprovalStepDto } from './dto/create-approval-step.dto';
import { ApplyDefaultsDto, ReorderStepsDto } from './dto/reorder-steps.dto';
import { UpdateApprovalStepDto } from './dto/update-approval-step.dto';

export type PermitTypeKind = 'work-permit' | 'external-permit';

@Injectable()
export class ApprovalStepsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  /* List steps for a single permit type, ordered by stepOrder. Used
     by the config UI and by the approval engine when initializing a
     chain instance. */
  findStepsForPermitType(companyId: string, permitType: PermitTypeKind, permitTypeId: string) {
    return this.prisma.permitApprovalStep.findMany({
      where: {
        companyId,
        ...(permitType === 'work-permit' ? { workPermitTypeId: permitTypeId } : { permitTypeId }),
      },
      orderBy: { stepOrder: 'asc' },
    });
  }

  /* Bulk listing for the config tab — returns every step grouped by
     target type. Caller groups in JS to keep the controller flat. */
  findAll(companyId: string) {
    return this.prisma.permitApprovalStep.findMany({
      where: { companyId },
      orderBy: [{ workPermitTypeId: 'asc' }, { permitTypeId: 'asc' }, { stepOrder: 'asc' }],
      include: {
        workPermitType: { select: { id: true, code: true, name: true } },
        permitType: { select: { id: true, code: true, name: true } },
      },
    });
  }

  async findOne(id: string, companyId: string) {
    const row = await this.prisma.permitApprovalStep.findFirst({ where: { id, companyId } });
    if (!row) throw new NotFoundException('Paso de aprobación no encontrado.');
    return row;
  }

  async create(companyId: string, userId: string, dto: CreateApprovalStepDto) {
    this.assertExactlyOneTarget(dto.workPermitTypeId, dto.permitTypeId);
    if (!dto.requiredRoles || dto.requiredRoles.length === 0) {
      throw new BadRequestException('Define al menos un rol autorizador para el paso.');
    }
    try {
      return await this.rlsService.executeWithRls(companyId, userId, (tx) =>
        tx.permitApprovalStep.create({
          data: {
            companyId,
            workPermitTypeId: dto.workPermitTypeId ?? null,
            permitTypeId: dto.permitTypeId ?? null,
            stepOrder: dto.stepOrder,
            name: dto.name.trim(),
            description: dto.description?.trim() ?? null,
            requiredRoles: dto.requiredRoles,
            requiresSpecificUserId: dto.requiresSpecificUserId ?? null,
            mustBeDifferentFromRequester: dto.mustBeDifferentFromRequester ?? true,
            mustBeDifferentFromPreviousApprovers: dto.mustBeDifferentFromPreviousApprovers ?? true,
            isOptional: dto.isOptional ?? false,
            createdBy: userId,
          },
        }),
      );
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Ya existe un paso con ese orden para este tipo.');
      }
      throw err;
    }
  }

  async update(id: string, companyId: string, userId: string, dto: UpdateApprovalStepDto) {
    await this.findOne(id, companyId);
    return this.rlsService.executeWithRls(companyId, userId, (tx) =>
      tx.permitApprovalStep.update({
        where: { id },
        data: {
          ...(dto.stepOrder !== undefined ? { stepOrder: dto.stepOrder } : {}),
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description?.trim() ?? null }
            : {}),
          ...(dto.requiredRoles !== undefined ? { requiredRoles: dto.requiredRoles } : {}),
          ...(dto.requiresSpecificUserId !== undefined
            ? { requiresSpecificUserId: dto.requiresSpecificUserId ?? null }
            : {}),
          ...(dto.mustBeDifferentFromRequester !== undefined
            ? { mustBeDifferentFromRequester: dto.mustBeDifferentFromRequester }
            : {}),
          ...(dto.mustBeDifferentFromPreviousApprovers !== undefined
            ? {
                mustBeDifferentFromPreviousApprovers: dto.mustBeDifferentFromPreviousApprovers,
              }
            : {}),
          ...(dto.isOptional !== undefined ? { isOptional: dto.isOptional } : {}),
        },
      }),
    );
  }

  async remove(id: string, companyId: string, userId: string) {
    /* Steps with recorded approvals are protected — deleting would
       leave PermitApproval rows pointing at a non-existent step
       (FK is RESTRICT). Operators should reorder/disable instead. */
    const used = await this.prisma.permitApproval.count({
      where: { approvalStepId: id, companyId },
    });
    if (used > 0) {
      throw new BadRequestException(
        'No se puede eliminar un paso con aprobaciones registradas. Desactívalo o reordénalo.',
      );
    }
    await this.findOne(id, companyId);
    return this.rlsService.executeWithRls(companyId, userId, (tx) =>
      tx.permitApprovalStep.delete({ where: { id } }),
    );
  }

  /* Reorder via a single transactional update. Frontend sends the
     desired (id, stepOrder) tuples after a drag-drop. */
  async reorder(companyId: string, userId: string, dto: ReorderStepsDto) {
    this.assertExactlyOneTarget(dto.workPermitTypeId, dto.permitTypeId);
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      for (const entry of dto.steps) {
        await tx.permitApprovalStep.update({
          where: { id: entry.id },
          data: { stepOrder: entry.stepOrder },
        });
      }
      return { reordered: dto.steps.length };
    });
  }

  /* Idempotent — looks up Chilean default chains by the catalog
     entry's `code` and inserts only steps that aren't already there.
     Returns counts so the UI can summarise. */
  async applyDefaults(companyId: string, userId: string, dto: ApplyDefaultsDto) {
    let created = 0;
    let skipped = 0;
    if (dto.mode === 'work-permits' || dto.mode === 'both') {
      const wpts = await this.prisma.workPermitType.findMany({
        where: {
          companyId,
          code: { in: Object.keys(DEFAULT_WORK_PERMIT_APPROVAL_CHAINS) },
        },
        select: { id: true, code: true },
      });
      for (const wpt of wpts) {
        const chain = DEFAULT_WORK_PERMIT_APPROVAL_CHAINS[wpt.code];
        if (!chain) continue;
        const result = await this.seedChainForTarget(companyId, userId, chain, {
          workPermitTypeId: wpt.id,
        });
        created += result.created;
        skipped += result.skipped;
      }
    }
    if (dto.mode === 'external-permits' || dto.mode === 'both') {
      const pts = await this.prisma.permitType.findMany({
        where: {
          companyId,
          code: { in: Object.keys(DEFAULT_EXTERNAL_PERMIT_APPROVAL_CHAINS) },
        },
        select: { id: true, code: true },
      });
      for (const pt of pts) {
        const chain = DEFAULT_EXTERNAL_PERMIT_APPROVAL_CHAINS[pt.code];
        if (!chain) continue;
        const result = await this.seedChainForTarget(companyId, userId, chain, {
          permitTypeId: pt.id,
        });
        created += result.created;
        skipped += result.skipped;
      }
    }
    return { created, skipped };
  }

  /* ---- Helpers ---- */

  private assertExactlyOneTarget(workPermitTypeId?: string, permitTypeId?: string) {
    const set = [workPermitTypeId, permitTypeId].filter(Boolean).length;
    if (set !== 1) {
      throw new BadRequestException('Define exactamente uno: workPermitTypeId o permitTypeId.');
    }
  }

  private async seedChainForTarget(
    companyId: string,
    userId: string,
    chain: DefaultApprovalChainStep[],
    target: { workPermitTypeId?: string; permitTypeId?: string },
  ) {
    const existing = await this.prisma.permitApprovalStep.findMany({
      where: {
        companyId,
        ...(target.workPermitTypeId
          ? { workPermitTypeId: target.workPermitTypeId }
          : { permitTypeId: target.permitTypeId }),
      },
      select: { stepOrder: true },
    });
    const existingOrders = new Set(existing.map((s) => s.stepOrder));
    const toInsert = chain.filter((c) => !existingOrders.has(c.stepOrder));
    if (toInsert.length === 0) {
      return { created: 0, skipped: chain.length };
    }
    await this.rlsService.executeWithRls(companyId, userId, (tx) =>
      tx.permitApprovalStep.createMany({
        data: toInsert.map((c) => ({
          companyId,
          workPermitTypeId: target.workPermitTypeId ?? null,
          permitTypeId: target.permitTypeId ?? null,
          stepOrder: c.stepOrder,
          name: c.name,
          description: c.description ?? null,
          requiredRoles: c.roles,
          mustBeDifferentFromRequester: c.mustBeDifferentFromRequester ?? true,
          mustBeDifferentFromPreviousApprovers: c.mustBeDifferentFromPreviousApprovers ?? true,
          isOptional: false,
          createdBy: userId,
        })),
      }),
    );
    return { created: toInsert.length, skipped: chain.length - toInsert.length };
  }
}
