import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { MovementStatus } from '@prisma/client';

import { MovementsService } from './movements.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { RlsService } from '../common/rls/rls.service';
import type { CreateMovementDto } from './dto/create-movement.dto';
import type { UpdateMovementDto } from './dto/update-movement.dto';

type PrismaMock = {
  movement: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    count: jest.Mock;
    aggregate: jest.Mock;
  };
  fiscalPeriod: {
    findUnique: jest.Mock;
  };
};

describe('MovementsService', () => {
  let service: MovementsService;
  let prisma: PrismaMock;
  let rls: { executeWithRls: jest.Mock };

  const companyId = 'company-1';
  const userId = 'user-1';
  const periodId = 'period-april-2026';

  const baseMovement = {
    id: 'm1',
    companyId,
    fiscalPeriodId: periodId,
    categoryId: 'cat-1',
    type: 'INCOME',
    status: MovementStatus.DRAFT,
    amount: 1000,
    date: new Date('2026-04-10'),
    description: 'Test movement',
    notes: null,
  };

  beforeEach(async () => {
    prisma = {
      movement: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
        aggregate: jest.fn(),
      },
      fiscalPeriod: {
        findUnique: jest.fn(),
      },
    };

    // The real RlsService opens a transaction and SETs local vars. Here we
    // pass a fake `tx` that just delegates to the prisma mocks — the contract
    // we're testing is "the service hands its work to RLS and uses tx.*".
    const tx = {
      movement: {
        create: prisma.movement.create,
        update: prisma.movement.update,
      },
    };
    rls = {
      executeWithRls: jest.fn(async (_cid: string, _uid: string, fn) => fn(tx)),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        MovementsService,
        { provide: PrismaService, useValue: prisma },
        { provide: RlsService, useValue: rls },
      ],
    }).compile();

    service = moduleRef.get(MovementsService);
  });

  // ───────────────────────── create ─────────────────────────

  describe('create', () => {
    it('creates a new movement with status DRAFT by default', async () => {
      // The service does not explicitly pass status; Prisma applies the model
      // default (DRAFT). We assert that we never force a non-draft status on
      // creation — drafts are the only way to start a movement.
      const dto: CreateMovementDto = {
        fiscalPeriodId: periodId,
        categoryId: 'cat-1',
        type: 'INCOME',
        amount: 1000,
        date: '2026-04-10',
        description: 'New',
      } as CreateMovementDto;

      prisma.movement.create.mockResolvedValue({ ...baseMovement, status: MovementStatus.DRAFT });

      const result = await service.create(companyId, userId, dto);

      expect(rls.executeWithRls).toHaveBeenCalledWith(companyId, userId, expect.any(Function));
      expect(prisma.movement.create).toHaveBeenCalledTimes(1);
      const createArgs = prisma.movement.create.mock.calls[0][0];
      expect(createArgs.data.companyId).toBe(companyId);
      expect(createArgs.data.createdBy).toBe(userId);
      // Status must never be forced — it falls back to the Prisma default DRAFT.
      expect(createArgs.data.status).toBeUndefined();
      expect(result.status).toBe(MovementStatus.DRAFT);
    });
  });

  // ───────────────────────── confirm ─────────────────────────

  describe('confirm', () => {
    it('transitions a DRAFT movement to CONFIRMED', async () => {
      prisma.movement.findFirst.mockResolvedValue({
        ...baseMovement,
        status: MovementStatus.DRAFT,
      });
      prisma.fiscalPeriod.findUnique.mockResolvedValue({ status: 'OPEN', name: 'Abril' });
      prisma.movement.update.mockResolvedValue({
        ...baseMovement,
        status: MovementStatus.CONFIRMED,
      });

      const result = await service.confirm('m1', companyId, userId);

      const updateArgs = prisma.movement.update.mock.calls[0][0];
      expect(updateArgs.data.status).toBe(MovementStatus.CONFIRMED);
      expect(updateArgs.data.confirmedBy).toBe(userId);
      expect(updateArgs.data.confirmedAt).toBeInstanceOf(Date);
      expect(result.status).toBe(MovementStatus.CONFIRMED);
    });

    it('throws BadRequestException when confirming a non-DRAFT movement', async () => {
      prisma.movement.findFirst.mockResolvedValue({
        ...baseMovement,
        status: MovementStatus.CONFIRMED,
      });

      await expect(service.confirm('m1', companyId, userId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.movement.update).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────── update (lock) ─────────────────────────

  describe('update', () => {
    it('rejects updates on CONFIRMED movements with BadRequestException', async () => {
      prisma.movement.findFirst.mockResolvedValue({
        ...baseMovement,
        status: MovementStatus.CONFIRMED,
      });

      const dto: UpdateMovementDto = { description: 'Changed' } as UpdateMovementDto;

      await expect(service.update('m1', companyId, userId, dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.movement.update).not.toHaveBeenCalled();
    });

    it('allows updating a DRAFT movement when the period is still open', async () => {
      prisma.movement.findFirst.mockResolvedValue({
        ...baseMovement,
        status: MovementStatus.DRAFT,
      });
      prisma.fiscalPeriod.findUnique.mockResolvedValue({ status: 'OPEN', name: 'Abril' });
      prisma.movement.update.mockResolvedValue({
        ...baseMovement,
        description: 'Changed',
      });

      const result = await service.update('m1', companyId, userId, {
        description: 'Changed',
      } as UpdateMovementDto);

      expect(result.description).toBe('Changed');
      expect(rls.executeWithRls).toHaveBeenCalled();
    });
  });

  // ───────────────────────── cancel ─────────────────────────

  describe('cancel', () => {
    it('changes a CONFIRMED movement to CANCELLED', async () => {
      prisma.movement.findFirst.mockResolvedValue({
        ...baseMovement,
        status: MovementStatus.CONFIRMED,
        notes: 'Original',
      });
      prisma.fiscalPeriod.findUnique.mockResolvedValue({ status: 'OPEN', name: 'Abril' });
      prisma.movement.update.mockResolvedValue({
        ...baseMovement,
        status: MovementStatus.CANCELLED,
      });

      const result = await service.cancel('m1', companyId, userId, 'Duplicate');

      const updateArgs = prisma.movement.update.mock.calls[0][0];
      expect(updateArgs.data.status).toBe(MovementStatus.CANCELLED);
      expect(updateArgs.data.cancelledBy).toBe(userId);
      expect(updateArgs.data.cancelledAt).toBeInstanceOf(Date);
      // Cancellation reason appended to existing notes for audit trail.
      expect(updateArgs.data.notes).toContain('Duplicate');
      expect(result.status).toBe(MovementStatus.CANCELLED);
    });

    it('refuses to cancel an already CANCELLED movement', async () => {
      prisma.movement.findFirst.mockResolvedValue({
        ...baseMovement,
        status: MovementStatus.CANCELLED,
      });

      await expect(service.cancel('m1', companyId, userId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuses to cancel a RECONCILED movement', async () => {
      prisma.movement.findFirst.mockResolvedValue({
        ...baseMovement,
        status: MovementStatus.RECONCILED,
      });

      await expect(service.cancel('m1', companyId, userId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  // ───────────────────────── getSummary ─────────────────────────

  describe('getSummary', () => {
    it('only aggregates CONFIRMED movements, ignoring DRAFT/CANCELLED/RECONCILED', async () => {
      prisma.movement.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 7500000 } }) // INCOME CONFIRMED
        .mockResolvedValueOnce({ _sum: { amount: 4850000 } }); // EXPENSE CONFIRMED

      const summary = await service.getSummary(companyId, periodId);

      expect(summary).toEqual({
        totalIncome: 7500000,
        totalExpense: 4850000,
        balance: 2650000,
        fiscalPeriodId: periodId,
      });

      const incomeCall = prisma.movement.aggregate.mock.calls[0][0];
      const expenseCall = prisma.movement.aggregate.mock.calls[1][0];
      expect(incomeCall.where.status).toBe(MovementStatus.CONFIRMED);
      expect(incomeCall.where.type).toBe('INCOME');
      expect(expenseCall.where.status).toBe(MovementStatus.CONFIRMED);
      expect(expenseCall.where.type).toBe('EXPENSE');
      // Period scoping is mandatory — without it, summaries would leak across
      // closed periods.
      expect(incomeCall.where.fiscalPeriodId).toBe(periodId);
      expect(expenseCall.where.fiscalPeriodId).toBe(periodId);
    });
  });
});
