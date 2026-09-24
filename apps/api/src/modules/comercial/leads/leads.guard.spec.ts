import { ForbiddenException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import {
  CaslAbilityFactory,
  LeadSubject,
  OpportunitySubject,
} from '../../common/casl/casl-ability.factory';
import {
  CHECK_POLICIES_KEY,
  PolicyHandler,
} from '../../common/decorators/check-policies.decorator';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { LeadsQueryDto } from './dto/leads-query.dto';
import { LeadsController } from './leads.controller';

describe('COM-024 LeadsController policy gates', () => {
  const reflector = new Reflector();
  const factory = new CaslAbilityFactory();
  it.each([
    ['findAll', 'read'],
    ['findOne', 'read'],
    ['create', 'create'],
    ['update', 'update'],
    ['remove', 'delete'],
  ] as const)('%s declares %s Lead and gates all roles', (method, action) => {
    const handlers = reflector.get<PolicyHandler[]>(
      CHECK_POLICIES_KEY,
      LeadsController.prototype[method],
    );
    expect(handlers.length).toBeGreaterThan(0);
    for (const role of Object.values(UserRole)) {
      const ability = factory.defineAbilityFor(role);
      expect(handlers.every((handler) => handler(ability))).toBe(ability.can(action, LeadSubject));
    }
    const onlyThis = {
      can: (verb: string, subject: unknown) => verb === action && subject === LeadSubject,
    };
    expect(handlers.every((handler) => handler(onlyThis as never))).toBe(true);
    const wrongSubject = {
      can: (verb: string, subject: unknown) => verb === action && subject === OpportunitySubject,
    };
    expect(handlers.every((handler) => handler(wrongSubject as never))).toBe(false);
  });

  it('create-and-link requires update Opportunity from current ability before calling service', () => {
    const service = { create: jest.fn() };
    const controller = new LeadsController(service as never);
    const leadOnly = { can: (_action: string, subject: unknown) => subject === LeadSubject };
    const dto = { name: 'Feria', accountId: 'a1', opportunityId: 'o1' };
    expect(() => controller.create('c1', { id: 'u1' }, dto, leadOnly as never)).toThrow(
      new ForbiddenException('No tienes permiso para vincular leads a oportunidades.'),
    );
    expect(service.create).not.toHaveBeenCalled();
    const canUpdate = {
      can: (action: string, subject: unknown) =>
        action === 'update' && subject === OpportunitySubject,
    };
    controller.create('c1', { id: 'u1' }, dto, canUpdate as never);
    expect(service.create).toHaveBeenCalledWith('c1', 'u1', dto);
  });

  it('creating without opportunityId needs no additional Opportunity ability', () => {
    const service = { create: jest.fn() };
    const controller = new LeadsController(service as never);
    const ability = { can: jest.fn().mockReturnValue(false) };
    controller.create('c1', { id: 'u1' }, { name: 'Feria', accountId: 'a1' }, ability as never);
    expect(ability.can).not.toHaveBeenCalled();
    expect(service.create).toHaveBeenCalledTimes(1);
  });
});

describe('COM-024 Lead DTOs at the global ValidationPipe boundary', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const accountId = '00000000-0000-4000-8000-000000000001';
  const transform = (
    metatype: typeof CreateLeadDto | typeof UpdateLeadDto | typeof LeadsQueryDto,
    value: unknown,
  ) => pipe.transform(value, { type: 'body', metatype });

  it('trims before enforcing length and accepts optional contact/opportunity UUIDs', async () => {
    expect(
      await transform(CreateLeadDto, {
        name: ` ${'F'.repeat(200)} `,
        accountId,
        contactId: accountId,
        opportunityId: accountId,
      }),
    ).toMatchObject({
      name: 'F'.repeat(200),
      accountId,
      contactId: accountId,
      opportunityId: accountId,
    });
  });
  it.each(['', '   ', 'F'.repeat(201), null, 123])(
    'rejects invalid names %p for both create and patch',
    async (name) => {
      await expect(transform(CreateLeadDto, { name, accountId })).rejects.toThrow();
      await expect(transform(UpdateLeadDto, { name })).rejects.toThrow();
    },
  );
  it.each(['accountId', 'contactId', 'opportunityId'])(
    'rejects invalid %s UUIDs',
    async (field) => {
      await expect(
        transform(CreateLeadDto, { name: 'Feria', accountId, [field]: 'invalid' }),
      ).rejects.toThrow();
    },
  );
  it('requires name and account on create; patch can omit both editable fields', async () => {
    await expect(transform(CreateLeadDto, { accountId })).rejects.toThrow();
    await expect(transform(CreateLeadDto, { name: 'Feria' })).rejects.toThrow();
    await expect(transform(UpdateLeadDto, {})).resolves.toEqual({});
    await expect(transform(UpdateLeadDto, { contactId: null })).resolves.toMatchObject({
      contactId: null,
    });
    await expect(transform(UpdateLeadDto, { contactId: 'invalid' })).rejects.toThrow();
  });
  it.each(['accountId', 'companyId', 'createdBy', 'opportunityId'])(
    'forbids immutable/server-owned %s on patch',
    async (field) => {
      await expect(transform(UpdateLeadDto, { [field]: accountId })).rejects.toThrow();
    },
  );
  it.each(['companyId', 'createdBy', 'createdAt', 'systemEvent'])(
    'forbids server-owned %s on create',
    async (field) => {
      await expect(
        transform(CreateLeadDto, { name: 'Feria', accountId, [field]: accountId }),
      ).rejects.toThrow();
    },
  );
  it('validates optional query account UUID and string q', async () => {
    await expect(transform(LeadsQueryDto, {})).resolves.toEqual({});
    await expect(transform(LeadsQueryDto, { accountId, q: 'Fer' })).resolves.toMatchObject({
      accountId,
      q: 'Fer',
    });
    await expect(transform(LeadsQueryDto, { accountId: 'bad' })).rejects.toThrow();
    await expect(transform(LeadsQueryDto, { q: ['bad'] })).rejects.toThrow();
  });
});
