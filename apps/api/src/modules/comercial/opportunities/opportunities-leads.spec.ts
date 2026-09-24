import { BadRequestException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { OpportunityStage } from '@prisma/client';
import { OpportunitiesService } from './opportunities.service';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';

function world(leadId: string | null = null, stage: OpportunityStage = 'PROSPECTO') {
  const opp = {
    id: 'o1',
    companyId: 'c1',
    accountId: 'a1',
    leadId,
    stage,
    ownerId: null,
    estimatedValue: null,
    expectedCloseDate: null,
    probability: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const tx = {
    opportunity: {
      findFirst: jest.fn().mockResolvedValue(opp),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...opp, ...data })),
    },
    lead: {
      findFirst: jest.fn().mockImplementation(({ where }) =>
        Promise.resolve(
          where.id === 'missing'
            ? null
            : {
                id: where.id,
                accountId: where.id === 'foreign-account' ? 'a2' : 'a1',
                name: where.id === 'l1' ? 'Feria' : 'Referido',
              },
        ),
      ),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
    activity: { create: jest.fn().mockResolvedValue({}) },
    opportunityService: { count: jest.fn().mockResolvedValue(0) },
  };
  const prisma = {
    opportunity: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ ...opp, lead: leadId ? { id: leadId, name: 'Feria' } : null }),
      findMany: jest
        .fn()
        .mockResolvedValue([
          { ...opp, lead: leadId ? { id: leadId, name: 'Feria' } : null, _count: { services: 0 } },
        ]),
    },
    account: { findFirst: jest.fn().mockResolvedValue({ id: 'a2' }) },
    activity: { findMany: jest.fn().mockResolvedValue([]) },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const executeWithRls = jest.fn(async (_c, _u, fn) => fn(tx));
  return {
    svc: new OpportunitiesService(prisma as never, { executeWithRls } as never, {} as never),
    tx,
    prisma,
    executeWithRls,
  };
}

describe('COM-024 opportunity origins', () => {
  it.each([
    [null, 'l1', 'Lead vinculado: Feria', 'LEAD'],
    ['l1', 'l2', 'Lead: Feria → Referido', 'LEAD'],
    ['l1', null, 'Lead desvinculado (era Feria)', 'LEAD_DESVINCULADO'],
  ])(
    '%p → %p: exact record subject and event in the mutation tx',
    async (before, after, subject, event) => {
      const w = world(before);
      await w.svc.update('o1', 'c1', 'u1', { leadId: after });
      expect(w.tx.opportunity.update).toHaveBeenCalledWith({
        where: { id: 'o1', companyId: 'c1' },
        data: { leadId: after },
      });
      expect(w.tx.activity.create).toHaveBeenCalledTimes(1);
      expect(w.tx.activity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          companyId: 'c1',
          accountId: 'a1',
          opportunityId: 'o1',
          createdBy: 'u1',
          subject,
          systemEvent: event,
          isSystemGenerated: true,
          status: null,
          statusChangedAt: null,
        }),
      });
      expect(w.executeWithRls).toHaveBeenCalledTimes(1);
      expect(w.tx.$queryRaw.mock.calls[0][0].sql).toContain('FOR UPDATE');
      expect(w.tx.$queryRaw.mock.calls[0][0].values).toEqual(['c1', 'o1']);
      expect(w.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        w.tx.opportunity.findFirst.mock.invocationCallOrder[0],
      );
      for (const [{ where }] of w.tx.lead.findFirst.mock.calls) expect(where.companyId).toBe('c1');
    },
  );

  it.each([
    ['l1', 'l1'],
    [null, null],
    ['l1', undefined],
  ])('no record without a real change: %p → %p', async (before, after) => {
    const w = world(before);
    await w.svc.update('o1', 'c1', 'u1', { leadId: after });
    expect(w.tx.activity.create).not.toHaveBeenCalled();
  });

  it('rejects a missing/foreign-company lead with 404', async () => {
    const w = world();
    await expect(w.svc.update('o1', 'c1', 'u1', { leadId: 'missing' })).rejects.toThrow(
      new NotFoundException('Lead no encontrado'),
    );
    expect(w.tx.lead.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'missing', companyId: 'c1' } }),
    );
    expect(w.tx.opportunity.update).not.toHaveBeenCalled();
  });

  it('rejects a missing/foreign-company opportunity before linking', async () => {
    const w = world();
    w.tx.opportunity.findFirst.mockResolvedValue(null);
    await expect(w.svc.update('foreign', 'c1', 'u1', { leadId: 'l1' })).rejects.toThrow(
      'Oportunidad no encontrada',
    );
    expect(w.tx.opportunity.update).not.toHaveBeenCalled();
  });

  it.each([
    [null, { leadId: 'foreign-account' }],
    ['l1', { accountId: 'a2' }],
    ['l1', { accountId: 'a2', leadId: 'l1' }],
  ])('rejects effective account mismatch: %p / %p', async (before, dto) => {
    const w = world(before as string | null);
    await expect(w.svc.update('o1', 'c1', 'u1', dto as UpdateOpportunityDto)).rejects.toThrow(
      new BadRequestException('El lead debe ser de la misma cuenta que la oportunidad.'),
    );
    expect(w.tx.opportunity.update).not.toHaveBeenCalled();
    expect(w.tx.activity.create).not.toHaveBeenCalled();
  });

  it.each([null, 'foreign-account'])(
    'account move may clear or replace its lead in the same PATCH: %p',
    async (leadId) => {
      const w = world('l1');
      await w.svc.update('o1', 'c1', 'u1', { accountId: 'a2', leadId });
      expect(w.tx.opportunity.update).toHaveBeenCalledWith({
        where: { id: 'o1', companyId: 'c1' },
        data: { accountId: 'a2', leadId },
      });
      expect(w.tx.activity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ accountId: 'a2' }),
      });
    },
  );

  it.each(['GANADA', 'PERDIDA'] as const)(
    '%s allows link and unlink without stage/probability changes',
    async (stage) => {
      for (const [before, after] of [
        [null, 'l1'],
        ['l1', null],
      ]) {
        const w = world(before, stage);
        await w.svc.update('o1', 'c1', 'u1', { leadId: after });
        expect(w.tx.opportunity.update.mock.calls[0][0].data).toEqual({ leadId: after });
        expect(w.tx.activity.create).toHaveBeenCalledTimes(1);
      }
    },
  );

  it('record failures reject the mutation transaction', async () => {
    const w = world();
    w.tx.activity.create.mockRejectedValue(new Error('record failed'));
    await expect(w.svc.update('o1', 'c1', 'u1', { leadId: 'l1' })).rejects.toThrow('record failed');
    expect(w.executeWithRls).toHaveBeenCalledTimes(1);
  });

  it.each([null, 'l1'])('findAll and findOne include lead id/name or null: %p', async (leadId) => {
    const w = world(leadId);
    const lead = leadId ? { id: leadId, name: 'Feria' } : null;
    expect(await w.svc.findOne('o1', 'c1')).toMatchObject({ lead });
    expect((await w.svc.findAll('c1'))[0]).toMatchObject({ lead });
    expect(w.prisma.opportunity.findFirst).toHaveBeenCalledWith({
      where: { id: 'o1', companyId: 'c1' },
      include: { lead: { select: { id: true, name: true } } },
    });
    expect(w.prisma.opportunity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({ lead: { select: { id: true, name: true } } }),
      }),
    );
  });

  it.each(['LEAD', 'LEAD_DESVINCULADO'])(
    'Actualización preserves the systemEvent kind %s',
    async (event) => {
      const w = world();
      const at = new Date('2026-09-24T12:00:00Z');
      w.prisma.$queryRaw.mockResolvedValue([
        { id: 'o1', lastMovementAt: at, lastUpdateAt: at, lastUpdateKind: event },
      ]);
      expect((await w.svc.findAll('c1'))[0].lastUpdate).toEqual({
        at: at.toISOString(),
        kind: event,
      });
      expect(w.prisma.$queryRaw.mock.calls[0][0].sql).toContain('a."systemEvent"::text');
    },
  );
});

describe('COM-024 UpdateOpportunityDto leadId', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const parse = (leadId: unknown) =>
    pipe.transform({ leadId }, { type: 'body', metatype: UpdateOpportunityDto });
  it.each([null, ''])('%p clears the link', async (value) => {
    expect(await parse(value)).toMatchObject({ leadId: null });
  });
  it('accepts a UUID or omission', async () => {
    const leadId = '00000000-0000-4000-8000-000000000001';
    expect(await parse(leadId)).toMatchObject({ leadId });
    await expect(parse(undefined)).resolves.toBeDefined();
  });
  it.each(['invalid', 3, [], {}])('rejects %p', async (value) => {
    await expect(parse(value)).rejects.toThrow();
  });
});
