import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LeadsService } from './leads.service';

const companyId = 'c1';
const userId = 'u1';
const base = {
  id: 'l1',
  companyId,
  name: 'Feria',
  accountId: 'a1',
  contactId: null,
  createdBy: userId,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const row = {
  ...base,
  account: { id: 'a1', name: 'Cuenta' },
  contact: null,
  _count: { opportunities: 0 },
  opportunities: [],
};
const knownError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('race', { code, clientVersion: '6.19.3' });

function world() {
  const tx = {
    lead: {
      findFirst: jest.fn(),
      create: jest.fn().mockResolvedValue(base),
      update: jest.fn().mockResolvedValue(base),
      delete: jest.fn().mockResolvedValue(base),
    },
    account: { findFirst: jest.fn().mockResolvedValue({ id: 'a1' }) },
    contact: { findFirst: jest.fn().mockResolvedValue({ id: 'ct1' }) },
    opportunity: {
      findFirst: jest.fn().mockResolvedValue({ id: 'o1', accountId: 'a1', leadId: null }),
      update: jest.fn().mockResolvedValue({ id: 'o1' }),
      count: jest.fn().mockResolvedValue(0),
    },
    activity: { create: jest.fn().mockResolvedValue({ id: 'sys1' }) },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  tx.lead.findFirst.mockResolvedValue(row);
  // No writes on the root client: writes and their validation reads must use tx.
  const prisma = {
    lead: {
      findMany: jest.fn().mockResolvedValue([row]),
      findFirst: jest.fn().mockResolvedValue(row),
    },
  };
  const executeWithRls = jest.fn(
    async (_company: string, _user: string, fn: (client: unknown) => unknown) => fn(tx),
  );
  return {
    svc: new LeadsService(prisma as never, { executeWithRls } as never),
    tx,
    prisma,
    executeWithRls,
  };
}

describe('COM-024 LeadsService', () => {
  it('lists with explicit company/account, insensitive name, name order and flattened count', async () => {
    const w = world();
    const result = await w.svc.findAll(companyId, { accountId: 'a1', q: ' FER ' });
    expect(w.prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId, accountId: 'a1', name: { contains: 'FER', mode: 'insensitive' } },
        orderBy: [{ name: 'asc' }],
      }),
    );
    expect(result[0].opportunitiesCount).toBe(0);
    expect(result[0]).not.toHaveProperty('_count');
    const select = w.prisma.lead.findMany.mock.calls[0][0].select;
    expect(select.account).toEqual({ select: { id: true, name: true } });
    expect(select.contact).toEqual({ select: { id: true, firstName: true, lastName: true } });
    expect(select).not.toHaveProperty('companyId');
  });

  it('lists without optional filters and returns an empty list', async () => {
    const w = world();
    w.prisma.lead.findMany.mockResolvedValue([]);
    expect(await w.svc.findAll(companyId)).toEqual([]);
    expect(w.prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId } }),
    );
  });

  it('detail selects the full contact and only scoped opportunity ficha fields, newest first', async () => {
    const w = world();
    expect(await w.svc.findOne('l1', companyId)).toMatchObject({
      id: 'l1',
      opportunitiesCount: 0,
      opportunities: [],
    });
    expect(w.prisma.lead.findFirst).toHaveBeenCalledWith({
      where: { id: 'l1', companyId },
      select: expect.objectContaining({
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
            email: true,
            phone: true,
          },
        },
        opportunities: {
          where: { companyId },
          orderBy: [{ createdAt: 'desc' }],
          select: {
            id: true,
            name: true,
            stage: true,
            estimatedValue: true,
            expectedCloseDate: true,
            ownerId: true,
            closedAt: true,
            createdAt: true,
          },
        },
      }),
    });
  });

  it.each(['findOne', 'update', 'remove'] as const)(
    '%s: absent/foreign lead gives the exact 404',
    async (method) => {
      const w = world();
      w.prisma.lead.findFirst.mockResolvedValue(null);
      w.tx.lead.findFirst.mockResolvedValue(null);
      const request =
        method === 'findOne'
          ? w.svc.findOne('foreign', companyId)
          : method === 'update'
            ? w.svc.update('foreign', companyId, userId, {})
            : w.svc.remove('foreign', companyId, userId);
      await expect(request).rejects.toThrow(new NotFoundException('Lead no encontrado'));
      expect(w.tx.lead.update).not.toHaveBeenCalled();
      expect(w.tx.lead.delete).not.toHaveBeenCalled();
    },
  );

  it('creates trimmed name with optional contact, JWT actor and no record when unlinked', async () => {
    const w = world();
    const result = await w.svc.create(companyId, userId, { name: ' Feria ', accountId: 'a1' });
    expect(result).toMatchObject({ id: 'l1', opportunitiesCount: 0 });
    expect(w.tx.lead.create).toHaveBeenCalledWith({
      data: { companyId, createdBy: userId, name: 'Feria', accountId: 'a1', contactId: null },
    });
    expect(w.executeWithRls).toHaveBeenCalledTimes(1);
    expect(w.tx.contact.findFirst).not.toHaveBeenCalled();
    expect(w.tx.activity.create).not.toHaveBeenCalled();
  });

  it('validates an existing contact in exactly the lead account and company', async () => {
    const w = world();
    await w.svc.create(companyId, userId, { name: 'Feria', accountId: 'a1', contactId: 'ct1' });
    expect(w.tx.contact.findFirst).toHaveBeenCalledWith({
      where: { id: 'ct1', companyId, accountId: 'a1' },
      select: { id: true },
    });
    expect(w.tx.lead.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ contactId: 'ct1' }),
    });
  });

  it.each(['create', 'update'] as const)(
    '%s rejects missing/foreign/other-account contact',
    async (method) => {
      const w = world();
      w.tx.contact.findFirst.mockResolvedValue(null);
      const request =
        method === 'create'
          ? w.svc.create(companyId, userId, { name: 'Feria', accountId: 'a1', contactId: 'bad' })
          : w.svc.update('l1', companyId, userId, { contactId: 'bad' });
      await expect(request).rejects.toThrow(
        new BadRequestException('El contacto debe ser de la cuenta del lead.'),
      );
      expect(w.tx.lead.create).not.toHaveBeenCalled();
      expect(w.tx.lead.update).not.toHaveBeenCalled();
    },
  );

  it('rejects missing/foreign account', async () => {
    const w = world();
    w.tx.account.findFirst.mockResolvedValue(null);
    await expect(
      w.svc.create(companyId, userId, { name: 'Feria', accountId: 'foreign' }),
    ).rejects.toThrow('Cuenta no encontrada en esta empresa.');
    expect(w.tx.account.findFirst).toHaveBeenCalledWith({
      where: { id: 'foreign', companyId },
      select: { id: true },
    });
    expect(w.tx.lead.create).not.toHaveBeenCalled();
  });

  it.each([
    ['', 'El nombre es obligatorio.'],
    ['   ', 'El nombre es obligatorio.'],
    ['x'.repeat(201), 'El nombre no puede superar los 200 caracteres.'],
    [null, 'El nombre debe ser un texto.'],
    [42, 'El nombre debe ser un texto.'],
  ])('rejects invalid name %p on create and update', async (name, message) => {
    const w = world();
    await expect(
      w.svc.create(companyId, userId, { name, accountId: 'a1' } as never),
    ).rejects.toThrow(message as string);
    await expect(w.svc.update('l1', companyId, userId, { name } as never)).rejects.toThrow(
      message as string,
    );
  });

  it('accepts exactly 200 Unicode characters after trimming', async () => {
    const w = world();
    await w.svc.create(companyId, userId, { name: ` ${'🌱'.repeat(200)} `, accountId: 'a1' });
    expect(w.tx.lead.create).toHaveBeenCalled();
  });

  it.each(['create', 'update'] as const)(
    '%s: case-insensitive duplicate precheck returns 409',
    async (method) => {
      const w = world();
      w.tx.$queryRaw.mockResolvedValue([{ id: 'duplicate' }]);
      const request =
        method === 'create'
          ? w.svc.create(companyId, userId, { name: 'feria', accountId: 'a1' })
          : w.svc.update('l1', companyId, userId, { name: 'feria' });
      await expect(request).rejects.toThrow(
        new ConflictException('Ya existe un lead con ese nombre en esta cuenta.'),
      );
      const sql = w.tx.$queryRaw.mock.calls[0][0];
      expect(sql.sql).toContain('lower(name) = lower(');
      expect(sql.values).toEqual([
        companyId,
        'a1',
        'feria',
        ...(method === 'update' ? ['l1'] : []),
      ]);
    },
  );

  it.each(['create', 'update'] as const)(
    '%s: P2002 race returns the same 409; other errors propagate',
    async (method) => {
      const w = world();
      const request = () =>
        method === 'create'
          ? w.svc.create(companyId, userId, { name: 'Feria', accountId: 'a1' })
          : w.svc.update('l1', companyId, userId, { name: 'Nueva' });
      w.tx.lead[method].mockRejectedValueOnce(knownError('P2002'));
      await expect(request()).rejects.toThrow(
        new ConflictException('Ya existe un lead con ese nombre en esta cuenta.'),
      );
      w.tx.lead[method].mockRejectedValueOnce(new Error('offline'));
      await expect(request()).rejects.toThrow('offline');
    },
  );

  it('rename excludes self, returns detail, and writes no opportunity record', async () => {
    const w = world();
    w.tx.lead.findFirst.mockResolvedValue({ ...row, name: 'Nueva' });
    expect(await w.svc.update('l1', companyId, userId, { name: ' Nueva ' })).toMatchObject({
      name: 'Nueva',
      opportunitiesCount: 0,
    });
    expect(w.tx.lead.update).toHaveBeenCalledWith({
      where: { id: 'l1', companyId },
      data: { name: 'Nueva' },
    });
    expect(w.tx.activity.create).not.toHaveBeenCalled();
    expect(w.tx.opportunity.update).not.toHaveBeenCalled();
  });

  it('null clears contact, while an omitted field is preserved', async () => {
    const w = world();
    await w.svc.update('l1', companyId, userId, { contactId: null });
    expect(w.tx.lead.update).toHaveBeenLastCalledWith({
      where: { id: 'l1', companyId },
      data: { contactId: null },
    });
    await w.svc.update('l1', companyId, userId, {});
    expect(w.tx.lead.update).toHaveBeenLastCalledWith({ where: { id: 'l1', companyId }, data: {} });
  });

  it.each(['%', '_', 'Ruta\\Feria'])(
    'uniqueness compares literal names with parameterized equality: %p',
    async (name) => {
      const w = world();
      await w.svc.create(companyId, userId, { name, accountId: 'a1' });
      const sql = w.tx.$queryRaw.mock.calls[0][0];
      expect(sql.sql).toContain('lower(name) = lower(');
      expect(sql.sql).not.toContain('ILIKE');
      expect(sql.values).toEqual([companyId, 'a1', name]);
      expect(w.tx.lead.create).toHaveBeenCalledWith({ data: expect.objectContaining({ name }) });
    },
  );

  it.each([
    [null, 'Lead vinculado: Feria'],
    ['old', 'Lead: Anterior → Feria'],
  ])(
    'create-and-link from %p writes exactly one record and returns linked detail in the same tx',
    async (beforeId, subject) => {
      const w = world();
      w.tx.opportunity.findFirst.mockResolvedValue({ id: 'o1', accountId: 'a1', leadId: beforeId });
      w.tx.lead.findFirst.mockImplementation(({ where, select }) =>
        Promise.resolve(
          where.id === 'old'
            ? { name: 'Anterior' }
            : select?.opportunities
              ? { ...row, _count: { opportunities: 1 }, opportunities: [{ id: 'o1' }] }
              : row,
        ),
      );
      const result = await w.svc.create(companyId, userId, {
        name: 'Feria',
        accountId: 'a1',
        opportunityId: 'o1',
      });
      expect(w.executeWithRls).toHaveBeenCalledTimes(1);
      expect(w.executeWithRls).toHaveBeenCalledWith(companyId, userId, expect.any(Function));
      expect(w.tx.opportunity.update).toHaveBeenCalledWith({
        where: { id: 'o1', companyId },
        data: { leadId: 'l1' },
      });
      expect(w.tx.activity.create).toHaveBeenCalledTimes(1);
      expect(w.tx.activity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          companyId,
          accountId: 'a1',
          opportunityId: 'o1',
          createdBy: userId,
          subject,
          systemEvent: 'LEAD',
          isSystemGenerated: true,
          status: null,
          statusChangedAt: null,
        }),
      });
      expect(result).toMatchObject({ opportunitiesCount: 1, opportunities: [{ id: 'o1' }] });
      const lockIndex = w.tx.$queryRaw.mock.calls.findIndex(([sql]) =>
        sql.sql.includes('FOR UPDATE'),
      );
      expect(lockIndex).toBeGreaterThanOrEqual(0);
      expect(w.tx.$queryRaw.mock.invocationCallOrder[lockIndex]).toBeLessThan(
        w.tx.opportunity.findFirst.mock.invocationCallOrder[0],
      );
    },
  );

  it.each([null, { id: 'o1', accountId: 'a2', leadId: null }])(
    'validates opportunity company/account before creating anything: %p',
    async (opportunity) => {
      const w = world();
      w.tx.opportunity.findFirst.mockResolvedValue(opportunity);
      await expect(
        w.svc.create(companyId, userId, { name: 'Feria', accountId: 'a1', opportunityId: 'o1' }),
      ).rejects.toThrow(
        opportunity ? 'La oportunidad es de otra cuenta.' : 'Oportunidad no encontrada',
      );
      expect(w.tx.opportunity.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'o1', companyId } }),
      );
      expect(w.tx.lead.create).not.toHaveBeenCalled();
    },
  );

  it('a record failure rejects the whole create-and-link transaction', async () => {
    const w = world();
    w.tx.activity.create.mockRejectedValue(new Error('record failed'));
    await expect(
      w.svc.create(companyId, userId, { name: 'Feria', accountId: 'a1', opportunityId: 'o1' }),
    ).rejects.toThrow('record failed');
    expect(w.executeWithRls).toHaveBeenCalledTimes(1);
  });

  it('hard-deletes only an unlinked lead inside RLS', async () => {
    const w = world();
    expect(await w.svc.remove('l1', companyId, userId)).toEqual({ id: 'l1' });
    expect(w.tx.opportunity.count).toHaveBeenCalledWith({ where: { companyId, leadId: 'l1' } });
    expect(w.tx.lead.delete).toHaveBeenCalledWith({ where: { id: 'l1', companyId } });
    expect(w.executeWithRls).toHaveBeenCalledTimes(1);
  });

  it('delete precheck includes the linked count in its 409', async () => {
    const w = world();
    w.tx.opportunity.count.mockResolvedValue(3);
    await expect(w.svc.remove('l1', companyId, userId)).rejects.toThrow(
      new ConflictException(
        'Este lead tiene 3 oportunidad(es) vinculada(s); desvincúlalas antes de eliminarlo.',
      ),
    );
    expect(w.tx.lead.delete).not.toHaveBeenCalled();
  });

  it('delete P2003 race recounts after rollback on a fresh RLS tx and returns 409', async () => {
    const w = world();
    w.tx.opportunity.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    w.tx.lead.delete.mockRejectedValue(knownError('P2003'));
    await expect(w.svc.remove('l1', companyId, userId)).rejects.toThrow(
      new ConflictException(
        'Este lead tiene 1 oportunidad(es) vinculada(s); desvincúlalas antes de eliminarlo.',
      ),
    );
    expect(w.executeWithRls).toHaveBeenCalledTimes(2);
  });

  it('delete propagates unrelated errors', async () => {
    const w = world();
    w.tx.lead.delete.mockRejectedValue(new Error('offline'));
    await expect(w.svc.remove('l1', companyId, userId)).rejects.toThrow('offline');
  });
});
