import { Test, TestingModule } from '@nestjs/testing';

import { RlsService } from './rls.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Unit-level verification of the RLS bridge between the app and Postgres.
 *
 * These tests prove the *contract* RlsService provides:
 *   1. Every mutation runs inside a prisma.$transaction.
 *   2. The transaction SETs `rls.company_id` to the requested company before
 *      any user queries — this is the value PostgreSQL policies check, so
 *      skipping or mistyping it would silently break tenant isolation.
 *   3. Running two companies back-to-back uses two separate SET LOCAL values,
 *      so Company B never sees the context left over from Company A.
 *   4. Audit context (`audit.company_id`, `audit.user_id`) is set in the
 *      same transaction so the DB triggers attribute writes correctly.
 *
 * The "Company A data not visible when RLS set to Company B" acceptance
 * criterion is enforced by PostgreSQL at runtime — that end-to-end check
 * lives as a standalone script (kept out of Jest via testPathIgnorePatterns).
 * Here we verify the application-level half that must be correct for the
 * database half to kick in.
 */
describe('RlsService', () => {
  let service: RlsService;
  let rawCalls: string[];
  let prisma: { $transaction: jest.Mock };

  beforeEach(async () => {
    rawCalls = [];

    // Fake `tx` captures every $executeRawUnsafe so we can assert the exact
    // SET LOCAL statements issued, in order.
    const fakeTx = {
      $executeRawUnsafe: jest.fn(async (sql: string) => {
        rawCalls.push(sql);
      }),
    };

    prisma = {
      $transaction: jest.fn(async (fn) => fn(fakeTx)),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [RlsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(RlsService);
  });

  describe('executeWithRls', () => {
    it('opens a single $transaction and returns the callback result', async () => {
      const result = await service.executeWithRls(
        '11111111-1111-1111-1111-111111111111',
        'user-a',
        async () => 'work-done',
      );

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(result).toBe('work-done');
    });

    it('SETs rls.company_id and audit context before the callback runs', async () => {
      const callback = jest.fn().mockResolvedValue('ok');

      await service.executeWithRls('11111111-1111-1111-1111-111111111111', 'user-a', callback);

      // SET statements must be issued before the callback executes — if the
      // callback ran first, any queries inside would bypass RLS with an unset
      // company_id (policies would return empty rather than enforce it).
      expect(rawCalls).toEqual([
        `SET LOCAL rls.company_id = '11111111-1111-1111-1111-111111111111'`,
        `SET LOCAL audit.company_id = '11111111-1111-1111-1111-111111111111'`,
        `SET LOCAL audit.user_id = 'user-a'`,
        // OPS-022 — also exposes the userId to per-user RLS policies
        // (e.g. user_notifications). Set last so audit.user_id keeps
        // its existing position for back-compat with anything reading
        // the trigger context first.
        `SET LOCAL rls.user_id = 'user-a'`,
      ]);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('omits the audit.user_id SET when no userId is supplied (system operations)', async () => {
      await service.executeWithRls('co-1', null, async () => 'sys');

      expect(rawCalls).toEqual([
        `SET LOCAL rls.company_id = 'co-1'`,
        `SET LOCAL audit.company_id = 'co-1'`,
      ]);
    });

    it('uses a distinct company context on consecutive invocations — Company B never inherits Company A', async () => {
      await service.executeWithRls('company-A', 'user-1', async () => 'A');
      await service.executeWithRls('company-B', 'user-2', async () => 'B');

      // Each call opens its own transaction; SET LOCAL scopes to that
      // transaction, so Company B's SETs are independent.
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);

      // Company A's block comes first, followed by Company B's — no leakage.
      // Each block now ends with the OPS-022 rls.user_id SET so per-user
      // policies see the right user for that transaction.
      expect(rawCalls).toEqual([
        `SET LOCAL rls.company_id = 'company-A'`,
        `SET LOCAL audit.company_id = 'company-A'`,
        `SET LOCAL audit.user_id = 'user-1'`,
        `SET LOCAL rls.user_id = 'user-1'`,
        `SET LOCAL rls.company_id = 'company-B'`,
        `SET LOCAL audit.company_id = 'company-B'`,
        `SET LOCAL audit.user_id = 'user-2'`,
        `SET LOCAL rls.user_id = 'user-2'`,
      ]);
    });

    it('propagates callback errors (SET LOCAL still scoped to the failing transaction)', async () => {
      const boom = new Error('query exploded');
      const callback = jest.fn().mockRejectedValue(boom);

      await expect(service.executeWithRls('co-1', 'user-1', callback)).rejects.toBe(boom);
      // The SETs were still issued — this is what we want: a failed callback
      // shouldn't cause RlsService to swallow the error silently. PostgreSQL
      // rolls the transaction back automatically. Count is 4 since OPS-022:
      // company_id + audit.company_id + audit.user_id + rls.user_id.
      expect(rawCalls.length).toBe(4);
    });
  });
});
