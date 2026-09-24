import { ArgumentsHost, BadRequestException, ValidationPipe } from '@nestjs/common';
import { OpportunityStage, Prisma } from '@prisma/client';
import { OpportunitiesService } from './opportunities.service';
import { OpportunitiesController } from './opportunities.controller';
import { ChangeStageDto } from './dto/change-stage.dto';
import { CreateOpportunityDto, ACTIVE_STAGES } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { ReopenOpportunityDto } from './dto/reopen-opportunity.dto';
import { ResumeOpportunityDto } from './dto/resume-opportunity.dto';
import { INITIAL_STAGE_PROBABILITIES, PROBABILITY_MESSAGE } from './stage-probabilities';
import { LOST_REASON_LABELS, STAGE_LABELS } from './opportunity-labels';
import { SentryExceptionFilter } from '../../common/filters/sentry-exception.filter';

type Row = Record<string, unknown>;
const c = 'c1',
  u = 'u1',
  id = 'o1';
const full = { estimatedValue: new Prisma.Decimal(100), expectedCloseDate: new Date('2026-10-01') };
function world(
  extra: Row = {},
  options: { bundle?: number; status?: string; defaults?: Row[] } = {},
) {
  const opp = {
    id,
    companyId: c,
    accountId: 'a1',
    name: 'Proyecto',
    stage: 'PROSPECTO',
    previousStage: null,
    estimatedValue: null,
    expectedCloseDate: null,
    probability: 30,
    ownerId: null,
    ...extra,
  };
  const members = [
    {
      userId: 'u1',
      companyId: c,
      isActive: true,
      user: { firstName: 'Ana', lastName: 'Pérez', email: 'ana@example.com' },
    },
    {
      userId: 'u2',
      companyId: c,
      isActive: true,
      user: { firstName: 'Bea', lastName: 'Díaz', email: 'bea@example.com' },
    },
    {
      userId: 'inactive',
      companyId: c,
      isActive: false,
      user: { firstName: 'Ex', lastName: 'Miembro', email: 'ex@example.com' },
    },
    {
      userId: 'fallback',
      companyId: c,
      isActive: true,
      user: { firstName: ' ', lastName: ' ', email: 'fallback@example.com' },
    },
    {
      userId: 'foreign',
      companyId: 'c2',
      isActive: true,
      user: { firstName: 'Otra', lastName: 'Empresa', email: 'other@example.com' },
    },
  ];
  const matches = (row: Row, where: Row) =>
    Object.entries(where).every(([key, value]) => row[key] === value);
  const account = { id: 'a1', companyId: c, status: options.status ?? 'ACTIVA' };
  const writes = {
    opportunity: {
      findFirst: jest.fn(async ({ where }) => (matches(opp, where) ? { ...opp } : null)),
      update: jest.fn(async ({ data }) => Object.assign(opp, data)),
      create: jest.fn(async ({ data }) => Object.assign(opp, data)),
    },
    opportunityService: { count: jest.fn(async () => options.bundle ?? 0) },
    opportunityStageProbability: { findMany: jest.fn(async () => options.defaults ?? []) },
    membership: {
      findFirst: jest.fn(async ({ where }) => members.find((m) => matches(m, where)) ?? null),
    },
    account: {
      findFirst: jest.fn(async ({ where }) => (matches(account, where) ? { ...account } : null)),
      updateMany: jest.fn(async ({ where, data }) => {
        const count = matches(account, where) ? 1 : 0;
        if (count) Object.assign(account, data);
        return { count };
      }),
    },
    activity: { create: jest.fn(async ({ data }) => data) },
  };
  const executeWithRls = jest.fn(async (_company, _user, fn) => fn(writes));
  // No writes or mutation reads on the root client; all new mutation logic uses tx.
  const prisma = { account: { findFirst: async () => ({ id: 'a1' }) } };
  const svc = new OpportunitiesService(prisma as never, { executeWithRls } as never, {} as never);
  return {
    svc,
    opp,
    account,
    tx: writes,
    executeWithRls,
    actions: () => writes.activity.create.mock.calls.map(([arg]) => arg.data),
  };
}
const fields = (value: boolean, date: boolean) => ({
  estimatedValue: value ? new Prisma.Decimal(0) : null,
  expectedCloseDate: date ? new Date('2026-10-01') : null,
});
const matrix: [OpportunityStage, boolean, boolean][] = [
  ['PROSPECTO', false, false],
  ['CONTACTO', false, false],
  ['VISITA_TECNICA', false, true],
  ['COTIZACION', true, true],
  ['NEGOCIACION', true, true],
  ['GANADA', true, true],
  ['PERDIDA', false, false],
  ['EN_PAUSA', false, false],
];

describe('COM-023 entry requirements', () => {
  it.each(matrix)(
    '%s requires value=%s date=%s, resets probability',
    async (stage, value, date) => {
      for (const hasValue of [false, true])
        for (const hasDate of [false, true]) {
          const w = world({
            ...fields(hasValue, hasDate),
            stage: stage === 'PROSPECTO' ? 'CONTACTO' : 'PROSPECTO',
          });
          const move = w.svc.changeStage(id, c, u, {
            stage,
            lostReason: 'PRECIO',
            reason: 'Revisar alcance',
          });
          if ((value && !hasValue) || (date && !hasDate)) {
            const missing = [
              value && !hasValue && 'valor estimado',
              date && !hasDate && 'fecha estimada de cierre',
            ]
              .filter(Boolean)
              .join(' y ');
            const context =
              stage === 'GANADA'
                ? 'Para marcar como Ganada'
                : `Para mover a ${STAGE_LABELS[stage]}`;
            await expect(move).rejects.toThrow(`${context} falta: ${missing}.`);
            expect(w.tx.opportunity.update).not.toHaveBeenCalled();
            expect(w.actions()).toEqual([]);
          } else {
            await move;
            expect(w.opp.probability).toBe(INITIAL_STAGE_PROBABILITIES[stage]);
            expect(w.actions()).toHaveLength(1);
          }
        }
    },
  );

  it.each(['changeStage', 'resume', 'reopen'] as const)(
    '%s fills and records fields in one RLS transaction',
    async (path) => {
      const w = world({
        stage: path === 'resume' ? 'EN_PAUSA' : path === 'reopen' ? 'PERDIDA' : 'PROSPECTO',
        previousStage: 'COTIZACION',
      });
      const dto = {
        estimatedValue: 100,
        expectedCloseDate: '2026-10-01',
        reason: '  Retomar propuesta  ',
      };
      if (path === 'changeStage')
        await w.svc.changeStage(id, c, u, { ...dto, stage: 'COTIZACION' });
      else await w.svc[path](id, c, u, dto);
      expect(w.executeWithRls).toHaveBeenCalledTimes(1);
      expect(w.executeWithRls.mock.calls[0].slice(0, 2)).toEqual([c, u]);
      expect(w.tx.opportunity.update).toHaveBeenCalledTimes(1);
      expect(w.opp.estimatedValue).toEqual(new Prisma.Decimal(100));
      expect(w.opp.expectedCloseDate).toEqual(new Date('2026-10-01'));
      expect(w.actions().map((a) => a.subject)).toEqual([
        'Valor estimado definido: $100',
        'Fecha de cierre definida: 01-10-2026',
        path === 'changeStage'
          ? 'Etapa: Prospecto → Cotización'
          : path === 'resume'
            ? 'Oportunidad reanudada (a Cotización)'
            : 'Oportunidad reabierta',
      ]);
      expect(w.actions().map((a) => a.systemEvent)).not.toContain('PROBABILIDAD');
      if (path === 'reopen') expect(w.actions()[2].detail).toBe('Motivo: Retomar propuesta');
    },
  );

  it.each(['changeStage', 'resume', 'reopen'] as const)(
    '%s accepts derived bundle value but rejects manual fill-in',
    async (path) => {
      const w = world(
        {
          ...full,
          stage: path === 'resume' ? 'EN_PAUSA' : path === 'reopen' ? 'PERDIDA' : 'CONTACTO',
          previousStage: 'COTIZACION',
        },
        { bundle: 1 },
      );
      const invoke = (estimatedValue?: number) =>
        path === 'changeStage'
          ? w.svc.changeStage(id, c, u, { stage: 'COTIZACION', estimatedValue })
          : w.svc[path](id, c, u, { estimatedValue, reason: 'Retomar propuesta' });
      await expect(invoke(200)).rejects.toThrow(
        'El valor estimado se deriva del bundle de servicios (suma de cantidad × precio); edita las líneas del bundle, no el valor directamente.',
      );
      expect(w.actions()).toEqual([]);
      await invoke();
      expect(w.opp.estimatedValue).toEqual(full.estimatedValue);
    },
  );

  it('resume without body still works and is never moving back; fallback stage is Negociación', async () => {
    const w = world(
      { ...full, stage: 'EN_PAUSA', previousStage: null },
      { defaults: [{ stage: 'NEGOCIACION', probability: 70 }] },
    );
    const controller = new OpportunitiesController(w.svc);
    await controller.resume(id, c, { id: u });
    expect(w.opp).toMatchObject({ stage: 'NEGOCIACION', probability: 70 });
    expect(w.actions()[0]).toMatchObject({
      subject: 'Oportunidad reanudada (a Negociación)',
      detail: null,
    });
  });

  it('resume and reopen list their missing fields in Spanish', async () => {
    await expect(
      world({ stage: 'EN_PAUSA', previousStage: 'VISITA_TECNICA' }).svc.resume(id, c, u),
    ).rejects.toThrow('Para reanudar en Visita Técnica falta: fecha estimada de cierre.');
    await expect(
      world({ stage: 'GANADA' }).svc.reopen(id, c, u, { reason: 'Revisar propuesta' }),
    ).rejects.toThrow(
      'Para reabrir en Negociación falta: valor estimado y fecha estimada de cierre.',
    );
  });

  it.each(matrix)(
    'update clearing applies effective %s, without blocking unrelated legacy edits',
    async (stage, value, date) => {
      for (const paused of [false, true]) {
        const extra = paused ? { stage: 'EN_PAUSA', previousStage: stage } : { stage };
        const legacy = world(extra);
        await legacy.svc.update(id, c, u, { notes: 'Se mantiene legado' });
        for (const [field, required, message] of [
          [
            'estimatedValue',
            value,
            'No puedes quitar el valor estimado en Cotización o etapas posteriores.',
          ],
          [
            'expectedCloseDate',
            date,
            'No puedes quitar la fecha estimada de cierre desde Visita Técnica en adelante.',
          ],
        ] as const) {
          const w = world({ ...full, ...extra });
          const update = w.svc.update(id, c, u, { [field]: null });
          if (required) await expect(update).rejects.toThrow(message);
          else {
            await update;
            expect(w.opp[field]).toBeNull();
          }
        }
      }
    },
  );

  it('pause with no previous stage has no effective requirements', async () => {
    const w = world({ ...full, stage: 'EN_PAUSA' });
    await w.svc.update(id, c, u, { estimatedValue: null, expectedCloseDate: null });
    expect(w.opp.estimatedValue).toBeNull();
  });
});

describe('COM-023 reasons', () => {
  it.each([
    ['NEGOCIACION', null, 'CONTACTO', 'Etapa: Negociación → Contacto'],
    ['EN_PAUSA', 'COTIZACION', 'PROSPECTO', 'Oportunidad reanudada (a Prospecto)'],
    ['EN_PAUSA', null, 'COTIZACION', 'Oportunidad reanudada (a Cotización)'],
  ] as const)(
    '%s / %s → %s requires trimmed reason, preserves subject',
    async (stage, previousStage, target, subject) => {
      for (const reason of [undefined, '', '  ']) {
        const w = world({ ...full, stage, previousStage });
        await expect(w.svc.changeStage(id, c, u, { stage: target, reason })).rejects.toThrow(
          'Retroceder de etapa requiere un motivo.',
        );
        expect(w.actions()).toEqual([]);
      }
      const w = world({ ...full, stage, previousStage });
      await w.svc.changeStage(id, c, u, { stage: target, reason: '  Nuevo alcance  ' });
      expect(w.actions()[0]).toMatchObject({ subject, detail: 'Motivo: Nuevo alcance' });
    },
  );

  it.each(['CONTACTO', 'NEGOCIACION', 'EN_PAUSA', 'GANADA', 'PERDIDA'] as const)(
    'non-backward move to %s ignores reason',
    async (stage) => {
      const w = world(full);
      await w.svc.changeStage(id, c, u, { stage, reason: 'No corresponde', lostReason: 'PRECIO' });
      expect(w.actions()[0].detail).toBeNull();
    },
  );

  it.each([undefined, '', '  '])(
    'reopen without a reason (%s) is rejected before writes',
    async (reason) => {
      const w = world({ ...full, stage: 'PERDIDA' });
      await expect(
        w.svc.reopen(id, c, u, reason === undefined ? undefined : { reason }),
      ).rejects.toThrow('Reabrir requiere un motivo.');
      expect(w.tx.opportunity.update).not.toHaveBeenCalled();
    },
  );

  it.each(['ab', 'a'.repeat(501)])('short/long reasons fail in the service too', async (reason) => {
    await expect(
      world({ stage: 'NEGOCIACION' }).svc.changeStage(id, c, u, { stage: 'CONTACTO', reason }),
    ).rejects.toThrow('Retroceder de etapa requiere un motivo de entre 3 y 500 caracteres.');
    await expect(world({ stage: 'PERDIDA' }).svc.reopen(id, c, u, { reason })).rejects.toThrow(
      'Reabrir requiere un motivo de entre 3 y 500 caracteres.',
    );
  });
});

describe('COM-023 create/probability', () => {
  it.each(ACTIVE_STAGES)(
    'create at %s enforces fields, uses stage default and creation detail',
    async (stage) => {
      const w = world({}, { defaults: [{ stage, probability: 50 }] });
      await w.svc.create(c, u, {
        accountId: 'a1',
        name: 'Proyecto',
        stage,
        estimatedValue: 0,
        expectedCloseDate: '2026-10-01',
      });
      expect(w.opp).toMatchObject({ stage, probability: 50 });
      expect(w.actions()[0]).toMatchObject({
        subject: 'Oportunidad creada',
        detail: stage === 'PROSPECTO' ? null : `Etapa inicial: ${STAGE_LABELS[stage]}`,
      });
      if (['VISITA_TECNICA', 'COTIZACION', 'NEGOCIACION'].includes(stage)) {
        await expect(
          world().svc.create(c, u, { accountId: 'a1', name: 'Falta', stage }),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
    },
  );

  it('omitted stage is Prospecto with default 10; explicit probability including zero takes precedence', async () => {
    for (const probability of [undefined, 0, 90]) {
      const w = world();
      await w.svc.create(c, u, { accountId: 'a1', name: 'Proyecto', probability });
      expect(w.opp).toMatchObject({ stage: 'PROSPECTO', probability: probability ?? 10 });
    }
  });

  it.each(['GANADA', 'PERDIDA', 'EN_PAUSA'] as const)(
    'create rejects %s in service',
    async (stage) => {
      await expect(
        world().svc.create(c, u, { accountId: 'a1', name: 'Proyecto', stage }),
      ).rejects.toThrow(
        'La etapa inicial debe ser Prospecto, Contacto, Visita Técnica, Cotización o Negociación.',
      );
    },
  );

  it('resets on stage changes; custom default never emits PROBABILIDAD', async () => {
    const w = world(
      { stage: 'PROSPECTO', probability: 90 },
      { defaults: [{ stage: 'CONTACTO', probability: 0 }] },
    );
    await w.svc.changeStage(id, c, u, { stage: 'CONTACTO' });
    expect(w.opp.probability).toBe(0);
    expect(w.actions().map((a) => a.systemEvent)).toEqual(['CAMBIO_ETAPA']);
  });

  it.each(['GANADA', 'PERDIDA'] as const)(
    'closed %s rejects every explicit probability update',
    async (stage) => {
      for (const probability of [0, 100, null]) {
        const w = world({ stage });
        await expect(w.svc.update(id, c, u, { probability })).rejects.toThrow(
          'La probabilidad no se edita en oportunidades ganadas o perdidas.',
        );
      }
    },
  );
});

describe('COM-023-B same-stage rejection', () => {
  it.each([...ACTIVE_STAGES, 'EN_PAUSA'] as OpportunityStage[])(
    '%s rejects before fill-in fields, probability reset or any write',
    async (stage) => {
      const w = world({ stage, probability: 90 });
      await expect(
        w.svc.changeStage(id, c, u, {
          stage,
          estimatedValue: 100,
          expectedCloseDate: '2026-10-01',
        }),
      ).rejects.toMatchObject({
        status: 400,
        message: `La oportunidad ya está en ${STAGE_LABELS[stage]}.`,
      });
      expect(w.opp).toMatchObject({
        stage,
        probability: 90,
        estimatedValue: null,
        expectedCloseDate: null,
      });
      expect(w.tx.opportunityStageProbability.findMany).not.toHaveBeenCalled();
      expect(w.tx.opportunity.update).not.toHaveBeenCalled();
      expect(w.tx.account.updateMany).not.toHaveBeenCalled();
      expect(w.tx.activity.create).not.toHaveBeenCalled();
    },
  );

  it.each(['GANADA', 'PERDIDA'] as const)(
    '%s keeps the closed-stage error first',
    async (stage) => {
      const w = world({ stage });
      await expect(w.svc.changeStage(id, c, u, { stage })).rejects.toThrow(
        'La oportunidad está cerrada (GANADA/PERDIDA). Usa "reabrir" para reactivarla.',
      );
      expect(w.tx.opportunity.update).not.toHaveBeenCalled();
      expect(w.tx.activity.create).not.toHaveBeenCalled();
    },
  );
});

describe('COM-023 owner and account history', () => {
  it.each([
    [null, 'u2', 'Responsable asignado: Bea Díaz'],
    ['u1', 'u2', 'Responsable: Ana Pérez → Bea Díaz'],
    ['inactive', null, 'Responsable quitado (era Ex Miembro)'],
    ['missing', 'fallback', 'Responsable: Usuario desconocido → fallback'],
    ['foreign', null, 'Responsable quitado (era Usuario desconocido)'],
  ])('%s → %s records names, never ids', async (before, after, subject) => {
    const w = world({ ownerId: before });
    await w.svc.update(id, c, u, { ownerId: after });
    expect(w.actions()).toEqual([
      expect.objectContaining({ subject, systemEvent: 'RESPONSABLE', createdBy: u }),
    ]);
    expect(w.executeWithRls).toHaveBeenCalledTimes(1);
  });

  it.each(['inactive', 'foreign', 'missing'])(
    'create and update reject owner %s',
    async (ownerId) => {
      const w = world();
      await expect(
        w.svc.create(c, u, { accountId: 'a1', name: 'Proyecto', ownerId }),
      ).rejects.toThrow('El responsable debe ser un miembro activo de la empresa.');
      await expect(w.svc.update(id, c, u, { ownerId })).rejects.toThrow(
        'El responsable debe ser un miembro activo de la empresa.',
      );
      expect(w.actions()).toEqual([]);
    },
  );

  it('null clears owner, unchanged owner emits nothing, active owner accepted at creation', async () => {
    const w = world({ ownerId: 'u1' });
    await w.svc.update(id, c, u, { ownerId: 'u1' });
    expect(w.actions()).toEqual([]);
    await w.svc.create(c, u, { accountId: 'a1', name: 'Proyecto', ownerId: 'u2' });
    expect(w.opp.ownerId).toBe('u2');
  });

  it.each(['PROSPECTO', 'INACTIVA', 'ACTIVA'])(
    'winning promotes %s only when needed, account record has no opportunity',
    async (status) => {
      const w = world(full, { status });
      await w.svc.changeStage(id, c, u, { stage: 'GANADA' });
      expect(w.account.status).toBe('ACTIVA');
      const actions = w.actions();
      expect(actions[0]).toMatchObject({
        systemEvent: 'GANADA',
        subject: 'Oportunidad ganada',
        opportunityId: id,
      });
      expect(actions).toHaveLength(status === 'ACTIVA' ? 1 : 2);
      if (status !== 'ACTIVA')
        expect(actions[1]).toMatchObject({
          systemEvent: 'CUENTA_CLIENTE',
          opportunityId: null,
          accountId: 'a1',
          subject: `Cuenta pasa a Cliente (antes ${status === 'PROSPECTO' ? 'Prospecto' : 'Inactiva'})`,
          detail: 'Oportunidad ganada: Proyecto',
        });
      expect(w.executeWithRls).toHaveBeenCalledTimes(1);
      await w.svc.reopen(id, c, u, { reason: 'Revisar acuerdo' });
      expect(w.account.status).toBe('ACTIVA');
      expect(w.actions().filter((a) => a.systemEvent === 'CUENTA_CLIENTE')).toHaveLength(
        status === 'ACTIVA' ? 0 : 1,
      );
    },
  );

  it.each(Object.entries(LOST_REASON_LABELS))(
    'lost reason %s uses shared label %s',
    async (lostReason, label) => {
      const w = world();
      await w.svc.changeStage(id, c, u, {
        stage: 'PERDIDA',
        lostReason: lostReason as never,
        lostReasonDetail: 'Detalle',
      });
      expect(w.actions()[0].subject).toBe(
        `Oportunidad perdida — ${label}${lostReason === 'OTRO' ? ': Detalle' : ''}`,
      );
    },
  );
});

const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
const validate = (type: new () => unknown, body: unknown) =>
  pipe.transform(body, { type: 'body', metatype: type });
const validCreate = { accountId: '00000000-0000-4000-8000-000000000001', name: 'Proyecto' };
describe('COM-023 DTO validation', () => {
  it.each([35, -10, 110, 20.5, '20', null])(
    'probability %s is rejected for create and update',
    async (probability) => {
      for (const dto of [CreateOpportunityDto, UpdateOpportunityDto]) {
        await expect(
          validate(
            dto,
            dto === CreateOpportunityDto ? { ...validCreate, probability } : { probability },
          ),
        ).rejects.toMatchObject({
          response: { message: expect.arrayContaining([PROBABILITY_MESSAGE]) },
        });
      }
    },
  );
  it.each([0, 10, 100])('probability %s is accepted', async (probability) => {
    await expect(
      validate(CreateOpportunityDto, { ...validCreate, probability }),
    ).resolves.toMatchObject({ probability });
  });
  it.each(['GANADA', 'PERDIDA', 'EN_PAUSA', 'INVALID', null])(
    'create rejects initial stage %s',
    async (stage) => {
      await expect(
        validate(CreateOpportunityDto, { ...validCreate, stage }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
  it('general update still lets the service reject every stage, including closed stages', async () => {
    await expect(validate(UpdateOpportunityDto, { stage: 'GANADA' })).resolves.toMatchObject({
      stage: 'GANADA',
    });
  });
  it.each([{}, { reason: '' }, { reason: '  ' }, { reason: null }])(
    'reopen missing/blank reason returns exact message',
    async (dto) => {
      const rejection = validate(ReopenOpportunityDto, dto);
      await expect(rejection).rejects.toMatchObject({
        response: { message: expect.arrayContaining(['Reabrir requiere un motivo.']) },
      });
      const json = jest.fn();
      const status = jest.fn(() => ({ json }));
      const path = '/api/comercial/opportunities/o1/reopen';
      const host = {
        switchToHttp: () => ({
          getResponse: () => ({ status }),
          getRequest: () => ({ url: path, method: 'POST' }),
        }),
      } as unknown as ArgumentsHost;
      await rejection.catch((error: unknown) => new SentryExceptionFilter().catch(error, host));
      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledTimes(1);
      expect(json).toHaveBeenCalledWith({
        statusCode: 400,
        message: 'Reabrir requiere un motivo.',
        timestamp: expect.any(String),
        path,
      });
    },
  );
  it('reason trims, short/long fail, empty update fields become null', async () => {
    expect(
      await validate(ChangeStageDto, { stage: 'CONTACTO', reason: '  Alcance  ' }),
    ).toMatchObject({ reason: 'Alcance' });
    for (const reason of ['ab', 'x'.repeat(501)])
      await expect(validate(ReopenOpportunityDto, { reason })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    expect(
      await validate(UpdateOpportunityDto, { estimatedValue: '', expectedCloseDate: '' }),
    ).toMatchObject({ estimatedValue: null, expectedCloseDate: null });
  });
  it.each([
    { estimatedValue: -1 },
    { estimatedValue: 1.001 },
    { estimatedValue: null },
    { expectedCloseDate: '' },
    { expectedCloseDate: '2026-02-30' },
  ])('rejects invalid fill-in %j', async (dto) => {
    for (const type of [ResumeOpportunityDto, ChangeStageDto, ReopenOpportunityDto]) {
      const body = {
        ...dto,
        ...(type === ChangeStageDto ? { stage: 'CONTACTO' } : {}),
        ...(type === ReopenOpportunityDto ? { reason: 'Retomar' } : {}),
      };
      await expect(validate(type, body)).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});
