import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { OpportunityStage, UserRole } from '@prisma/client';
import { CaslAbilityFactory, OpportunitySubject } from '../../common/casl/casl-ability.factory';
import {
  CHECK_POLICIES_KEY,
  PolicyHandler,
} from '../../common/decorators/check-policies.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { ComercialController } from '../comercial.controller';
import { StageProbabilitiesController } from './stage-probabilities.controller';
import { StageProbabilitiesService } from './stage-probabilities.service';
import { UpdateStageProbabilitiesDto } from './dto/stage-probabilities.dto';
import { INITIAL_STAGE_PROBABILITIES, loadStageProbabilities } from './stage-probabilities';

function world() {
  const rows: {
    companyId: string;
    stage: OpportunityStage;
    probability: number;
    updatedBy: string;
  }[] = [];
  const table = {
    findMany: jest.fn(async ({ where }) => rows.filter((r) => r.companyId === where.companyId)),
    upsert: jest.fn(async ({ where, create, update }) => {
      const row = rows.find(
        (r) =>
          r.companyId === where.companyId_stage.companyId &&
          r.stage === where.companyId_stage.stage,
      );
      if (row) Object.assign(row, update);
      else rows.push({ ...create });
    }),
  };
  const tx = { opportunityStageProbability: table };
  const executeWithRls = jest.fn(async (_company, _user, fn) => fn(tx));
  return {
    rows,
    table,
    tx,
    executeWithRls,
    service: new StageProbabilitiesService({ executeWithRls } as never),
  };
}

describe('COM-023 stage default probabilities', () => {
  it('GET returns eight stages in pipeline order with lazy defaults and flags, without inserts', async () => {
    const w = world();
    expect(await w.service.findAll('c1', 'u1')).toEqual(
      Object.entries(INITIAL_STAGE_PROBABILITIES).map(([stage, probability]) => ({
        stage,
        probability,
        editable: !['GANADA', 'PERDIDA'].includes(stage),
        isDefault: true,
      })),
    );
    expect(w.table.findMany).toHaveBeenCalledTimes(1);
    expect(w.table.findMany).toHaveBeenCalledWith({
      where: { companyId: 'c1' },
      select: { stage: true, probability: true },
    });
    expect(w.rows).toEqual([]);
    expect(w.table.upsert).not.toHaveBeenCalled();
  });

  it('PUT upserts only defaults, actor from JWT, returns GET shape, isolates companies', async () => {
    const w = world();
    const result = await w.service.update('c1', 'admin1', {
      items: [
        { stage: 'CONTACTO', probability: 0 },
        { stage: 'COTIZACION', probability: 60 },
      ],
    });
    expect(result[1]).toEqual({
      stage: 'CONTACTO',
      probability: 0,
      editable: true,
      isDefault: false,
    });
    expect(result[3]).toEqual({
      stage: 'COTIZACION',
      probability: 60,
      editable: true,
      isDefault: false,
    });
    expect(result[6]).toEqual({
      stage: 'GANADA',
      probability: 100,
      editable: false,
      isDefault: true,
    });
    expect(w.executeWithRls).toHaveBeenCalledTimes(1);
    expect(w.table.upsert).toHaveBeenCalledTimes(2);
    expect(w.rows.every((r) => r.updatedBy === 'admin1')).toBe(true);
    await w.service.update('c1', 'admin2', { items: [{ stage: 'CONTACTO', probability: 50 }] });
    expect(w.rows).toHaveLength(2);
    expect(w.rows[0]).toMatchObject({ probability: 50, updatedBy: 'admin2' });
    expect((await w.service.findAll('c2', 'u2')).every((r) => r.isDefault)).toBe(true);
    // The fake has no opportunity delegate: updating defaults cannot rewrite deals.
  });

  it('loader uses one findMany, fills missing stages and keeps closed outcomes fixed', async () => {
    const w = world();
    w.rows.push({ companyId: 'c1', stage: 'PROSPECTO', probability: 30, updatedBy: 'u1' });
    expect(await loadStageProbabilities(w.tx as never, 'c1')).toEqual({
      ...INITIAL_STAGE_PROBABILITIES,
      PROSPECTO: 30,
    });
    expect(w.table.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('COM-023 stage probabilities endpoint guards and permission flags', () => {
  const factory = new CaslAbilityFactory();
  it('registers both guards, plus read/manage policies that enforce the six-role matrix', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, StageProbabilitiesController)).toEqual([
      JwtAuthGuard,
      PoliciesGuard,
    ]);
    for (const [handler, action] of [
      ['findAll', 'read'],
      ['update', 'manage'],
    ] as const) {
      const policies = Reflect.getMetadata(
        CHECK_POLICIES_KEY,
        StageProbabilitiesController.prototype[handler],
      ) as PolicyHandler[];
      expect(policies).toHaveLength(1);
      for (const role of Object.values(UserRole)) {
        const ability = factory.defineAbilityFor(role);
        expect(policies[0](ability)).toBe(ability.can(action, OpportunitySubject));
        if (action === 'manage')
          expect(policies[0](ability)).toBe(['ADMIN', 'SUPER_ADMIN'].includes(role));
      }
    }
  });
  it.each(Object.values(UserRole))('%s permissions are CASL-derived', (role) => {
    const ability = factory.defineAbilityFor(role);
    const controller = new ComercialController({} as never);
    expect(controller.permissions(ability).stageProbabilities).toEqual({
      read: ability.can('read', OpportunitySubject),
      update: ability.can('manage', OpportunitySubject),
    });
  });
  it('controllers pass company and JWT actor, with body only for PUT', async () => {
    const svc = { findAll: jest.fn(), update: jest.fn() };
    const controller = new StageProbabilitiesController(svc as never);
    const dto = { items: [{ stage: 'PROSPECTO' as const, probability: 20 }] };
    controller.findAll('c1', { id: 'u1' });
    controller.update('c1', { id: 'admin' }, dto);
    expect(svc.findAll).toHaveBeenCalledWith('c1', 'u1');
    expect(svc.update).toHaveBeenCalledWith('c1', 'admin', dto);
  });
});

describe('COM-023 stage probabilities PUT validation (400)', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const validate = (body: unknown) =>
    pipe.transform(body, { type: 'body', metatype: UpdateStageProbabilitiesDto });
  it.each([
    {},
    { items: [] },
    { items: null },
    { items: 'not-array' },
    { items: Array.from({ length: 7 }, () => ({ stage: 'CONTACTO', probability: 20 })) },
    {
      items: [
        { stage: 'CONTACTO', probability: 20 },
        { stage: 'CONTACTO', probability: 30 },
      ],
    },
    ...['GANADA', 'PERDIDA', 'invalid'].map((stage) => ({ items: [{ stage, probability: 20 }] })),
    ...[-10, 110, 35, 10.5, null, '10', undefined].map((probability) => ({
      items: [{ stage: 'PROSPECTO', probability }],
    })),
    { items: [null] },
    { items: [{}] },
    { items: [10] },
    { items: [{ stage: 'CONTACTO', probability: 20, updatedBy: 'forged' }] },
  ])('rejects %j', async (body) => {
    await expect(validate(body)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('accepts all six editable stages and boundary probabilities', async () => {
    const body = {
      items: [
        'PROSPECTO',
        'CONTACTO',
        'VISITA_TECNICA',
        'COTIZACION',
        'NEGOCIACION',
        'EN_PAUSA',
      ].map((stage, i) => ({ stage, probability: i % 2 ? 100 : 0 })),
    };
    await expect(validate(body)).resolves.toEqual(body);
  });
});
