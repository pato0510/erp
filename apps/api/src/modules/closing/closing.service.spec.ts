import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { ClosingService } from './closing.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { RlsService } from '../common/rls/rls.service';

type PrismaMock = {
  fiscalPeriod: { findFirst: jest.Mock; update: jest.Mock };
  movement: { count: jest.Mock; aggregate: jest.Mock; groupBy: jest.Mock };
  externalBankMovement: { count: jest.Mock };
  taxDocument: { count: jest.Mock; aggregate: jest.Mock };
  commitment: { count: jest.Mock; aggregate: jest.Mock; groupBy: jest.Mock };
  alert: { count: jest.Mock };
  accountBalance: { findMany: jest.Mock };
  category: { findMany: jest.Mock };
  company: { findUnique: jest.Mock };
  user: { findUnique: jest.Mock };
  membership: { findUnique: jest.Mock };
};

describe('ClosingService', () => {
  let service: ClosingService;
  let prisma: PrismaMock;
  let rls: { executeWithRls: jest.Mock };

  const companyId = 'company-1';
  const userId = 'user-admin';
  const periodId = 'period-april-2026';

  const periodInReview = {
    id: periodId,
    companyId,
    name: 'Abril 2026',
    year: 2026,
    month: 4,
    status: 'IN_REVIEW',
    startDate: new Date('2026-04-01'),
    endDate: new Date('2026-04-30'),
    closedAt: null,
    closedBy: null,
    notes: null,
  };

  beforeEach(async () => {
    prisma = {
      fiscalPeriod: { findFirst: jest.fn(), update: jest.fn() },
      movement: { count: jest.fn(), aggregate: jest.fn(), groupBy: jest.fn() },
      externalBankMovement: { count: jest.fn() },
      taxDocument: { count: jest.fn(), aggregate: jest.fn() },
      commitment: { count: jest.fn(), aggregate: jest.fn(), groupBy: jest.fn() },
      alert: { count: jest.fn() },
      accountBalance: { findMany: jest.fn() },
      category: { findMany: jest.fn() },
      company: { findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
      membership: { findUnique: jest.fn() },
    };

    rls = {
      executeWithRls: jest.fn(async (_cid: string, _uid: string, fn) =>
        fn({
          fiscalPeriod: {
            update: prisma.fiscalPeriod.update,
          },
        }),
      ),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ClosingService,
        { provide: PrismaService, useValue: prisma },
        { provide: RlsService, useValue: rls },
      ],
    }).compile();

    service = moduleRef.get(ClosingService);
  });

  // Helper — setup the 5 checklist queries so every item is OK.
  function mockAllChecklistOk() {
    prisma.fiscalPeriod.findFirst.mockResolvedValue(periodInReview);
    // 1. movements_confirmed → no DRAFT
    prisma.movement.count.mockImplementation(({ where }: { where: { status?: string } }) => {
      if (where?.status === 'DRAFT') return Promise.resolve(0);
      return Promise.resolve(0);
    });
    // 2. bank_reconciliation → 100% (0/0 also counts as OK)
    prisma.externalBankMovement.count.mockResolvedValue(0);
    // 3. tax_reconciliation → 100%
    prisma.taxDocument.count.mockResolvedValue(0);
    // 4. pending_commitments → none overdue
    prisma.commitment.count.mockResolvedValue(0);
    // 5. open_alerts → no CRITICAL
    prisma.alert.count.mockResolvedValue(0);
  }

  // ───────────────────────── getChecklist ─────────────────────────

  describe('getChecklist', () => {
    it('marks movements_confirmed as BLOCKED when DRAFT movements exist', async () => {
      prisma.fiscalPeriod.findFirst.mockResolvedValue(periodInReview);

      // Only DRAFT movements matter for this rule; all others are OK to avoid
      // coupling this test to checks we aren't asserting on.
      prisma.movement.count.mockImplementation(({ where }: { where: { status?: string } }) => {
        if (where?.status === 'DRAFT') return Promise.resolve(3);
        return Promise.resolve(0);
      });
      prisma.externalBankMovement.count.mockResolvedValue(0);
      prisma.taxDocument.count.mockResolvedValue(0);
      prisma.commitment.count.mockResolvedValue(0);
      prisma.alert.count.mockResolvedValue(0);

      const checklist = await service.getChecklist(companyId, periodId);

      const drafts = checklist.items.find((i) => i.key === 'movements_confirmed');
      expect(drafts?.status).toBe('BLOCKED');
      expect(drafts?.count).toBe(3);
      expect(checklist.canClose).toBe(false);
      expect(checklist.blockedReasons.length).toBeGreaterThan(0);
    });

    it('returns canClose=true when no rule is BLOCKED', async () => {
      mockAllChecklistOk();

      const checklist = await service.getChecklist(companyId, periodId);

      expect(checklist.canClose).toBe(true);
      expect(checklist.blockedReasons).toHaveLength(0);
      expect(checklist.items.every((i) => i.status === 'OK')).toBe(true);
    });
  });

  // ───────────────────────── closePeriod ─────────────────────────

  describe('closePeriod', () => {
    it('fails when the period is not in IN_REVIEW', async () => {
      prisma.fiscalPeriod.findFirst.mockResolvedValue({ ...periodInReview, status: 'OPEN' });

      await expect(service.closePeriod(companyId, userId, periodId, 'ok')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.fiscalPeriod.update).not.toHaveBeenCalled();
    });

    it('fails when checklist has BLOCKED items', async () => {
      prisma.fiscalPeriod.findFirst.mockResolvedValue(periodInReview);
      // DRAFT movements → BLOCKED → closePeriod must reject
      prisma.movement.count.mockImplementation(({ where }: { where: { status?: string } }) => {
        if (where?.status === 'DRAFT') return Promise.resolve(2);
        return Promise.resolve(0);
      });
      prisma.externalBankMovement.count.mockResolvedValue(0);
      prisma.taxDocument.count.mockResolvedValue(0);
      prisma.commitment.count.mockResolvedValue(0);
      prisma.alert.count.mockResolvedValue(0);

      await expect(service.closePeriod(companyId, userId, periodId, 'try')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.fiscalPeriod.update).not.toHaveBeenCalled();
    });

    it('succeeds when all checklist items are OK and transitions to CLOSED', async () => {
      mockAllChecklistOk();

      // Summary dependencies — we only need the aggregate calls to resolve.
      prisma.company.findUnique.mockResolvedValue({
        id: companyId,
        name: 'Empresa Demo',
        taxId: '76.123.456-7',
        legalName: 'Empresa Demo SpA',
      });
      prisma.movement.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
      prisma.accountBalance.findMany.mockResolvedValue([]);
      prisma.commitment.groupBy.mockResolvedValue([]);
      prisma.commitment.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
      prisma.taxDocument.aggregate.mockResolvedValue({ _sum: { totalAmount: 0 } });
      prisma.movement.groupBy.mockResolvedValue([]);
      prisma.user.findUnique.mockResolvedValue({
        firstName: 'Admin',
        lastName: 'Demo',
        email: 'admin@excelsia.dev',
      });
      prisma.fiscalPeriod.update.mockResolvedValue({
        ...periodInReview,
        status: 'CLOSED',
        closedAt: new Date(),
        closedBy: userId,
      });

      const result = await service.closePeriod(companyId, userId, periodId, 'Cierre abril');

      expect(rls.executeWithRls).toHaveBeenCalledWith(companyId, userId, expect.any(Function));
      const updateArgs = prisma.fiscalPeriod.update.mock.calls[0][0];
      expect(updateArgs.where).toEqual({ id: periodId });
      expect(updateArgs.data.status).toBe('CLOSED');
      expect(updateArgs.data.closedBy).toBe(userId);
      expect(updateArgs.data.closedAt).toBeInstanceOf(Date);
      expect(result.period.status).toBe('CLOSED');
    });
  });

  // ───────────────────────── reopenPeriod ─────────────────────────

  describe('reopenPeriod', () => {
    const closedPeriod = {
      ...periodInReview,
      status: 'CLOSED',
      closedAt: new Date('2026-05-01'),
      closedBy: userId,
    };

    it('reopens a CLOSED period when the user is ADMIN, clearing closedAt/closedBy', async () => {
      prisma.membership.findUnique.mockResolvedValue({ role: 'ADMIN', isActive: true });
      prisma.fiscalPeriod.findFirst.mockResolvedValue(closedPeriod);
      prisma.fiscalPeriod.update.mockResolvedValue({
        ...closedPeriod,
        status: 'OPEN',
        closedAt: null,
        closedBy: null,
      });

      const result = await service.reopenPeriod(
        companyId,
        userId,
        periodId,
        'Ajuste contable por error',
      );

      const updateArgs = prisma.fiscalPeriod.update.mock.calls[0][0];
      expect(updateArgs.data.status).toBe('OPEN');
      expect(updateArgs.data.closedAt).toBeNull();
      expect(updateArgs.data.closedBy).toBeNull();
      // The reason is appended to notes for the audit trail.
      expect(updateArgs.data.notes).toContain('Ajuste contable por error');
      expect(result.status).toBe('OPEN');
    });

    it('rejects non-ADMIN users with ForbiddenException', async () => {
      prisma.membership.findUnique.mockResolvedValue({ role: 'MANAGER', isActive: true });

      await expect(
        service.reopenPeriod(companyId, userId, periodId, 'Trying anyway'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.fiscalPeriod.update).not.toHaveBeenCalled();
    });

    it('rejects reopen attempts with short reason', async () => {
      prisma.membership.findUnique.mockResolvedValue({ role: 'ADMIN', isActive: true });

      await expect(service.reopenPeriod(companyId, userId, periodId, 'no')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.fiscalPeriod.update).not.toHaveBeenCalled();
    });

    it('rejects reopen on a non-CLOSED period', async () => {
      prisma.membership.findUnique.mockResolvedValue({ role: 'ADMIN', isActive: true });
      prisma.fiscalPeriod.findFirst.mockResolvedValue({
        ...periodInReview,
        status: 'OPEN',
      });

      await expect(
        service.reopenPeriod(companyId, userId, periodId, 'Valid reason here'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
