import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import { Logger } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { TodosService } from '../actividades/todos/todos.service';
import {
  AlertRuleSubject,
  AppAbility,
  CampaignSubject,
  CaslAbilityFactory,
  EmployeeSubject,
  HsecIncidentSubject,
  MovementSubject,
  OpportunitySubject,
  QuoteSubject,
  TodoSubject,
} from '../common/casl/casl-ability.factory';
import { HubService } from './hub.service';

const COMPANY = 'company-a';
const USER = 'user-a';
const factory = new CaslAbilityFactory();
const admin = factory.defineAbilityFor(UserRole.ADMIN);
type HubReadSubject =
  | typeof AlertRuleSubject
  | typeof CampaignSubject
  | typeof EmployeeSubject
  | typeof HsecIncidentSubject
  | typeof MovementSubject
  | typeof OpportunitySubject
  | typeof QuoteSubject
  | typeof TodoSubject;

function reads(...allowed: HubReadSubject[]): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);
  allowed.forEach((subject) => can('read', subject));
  return build();
}

function setup(count = 0) {
  const tx = {
    category: {
      findMany: jest.fn().mockResolvedValue([{ id: 'default-income' }, { id: 'default-expense' }]),
    },
    movement: { count: jest.fn().mockResolvedValue(count) },
    hsecIncident: { count: jest.fn().mockResolvedValue(count) },
    campaign: { count: jest.fn().mockResolvedValue(count) },
    employeeContract: { count: jest.fn().mockResolvedValue(count) },
    employeeDocument: { count: jest.fn().mockResolvedValue(0) },
    certification: { count: jest.fn().mockResolvedValue(0) },
  };
  const rls = {
    executeWithRls: jest.fn(
      (_company: string, _user: string, fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
    ),
  };
  const comercial = { getAlerts: jest.fn().mockResolvedValue({ counts: { total: count } }) };
  const todos = {
    alerts: jest
      .fn()
      .mockResolvedValue({ counts: { overdue: count, dueSoon: count, total: count * 2 } }),
  };
  const operations = { getKpis: jest.fn().mockResolvedValue({ active: count, critical: count }) };
  const service = new HubService(
    rls as never,
    comercial as never,
    todos as never,
    operations as never,
  );
  return { service, tx, rls, comercial, todos, operations };
}

const zeroLines = [
  { moduleKey: 'finanzas', kind: 'correcto', message: 'sin movimientos por categorizar' },
  { moduleKey: 'operaciones', kind: 'correcto', message: 'sin alertas activas' },
  { moduleKey: 'hsec', kind: 'correcto', message: '0 incidentes · últimos 30 días' },
  { moduleKey: 'comercial', kind: 'correcto', message: 'sin alertas comerciales' },
  { moduleKey: 'marketing', kind: 'informativo', message: 'sin campañas activas' },
  { moduleKey: 'rrhh', kind: 'correcto', message: 'sin vencimientos en 30 días' },
  { moduleKey: 'gestion', kind: 'correcto', message: 'sin tareas pendientes de vencimiento' },
];

describe('HUB-003a live status', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('returns exactly two authorized modules and never calls unauthorized sources', async () => {
    const { service, rls, tx, comercial, todos, operations } = setup();
    const ability = reads(MovementSubject, TodoSubject);
    expect(await service.getStatus(COMPANY, USER, ability)).toEqual({
      lines: [zeroLines[0], zeroLines[6]],
    });
    expect(rls.executeWithRls).toHaveBeenCalledTimes(1);
    expect(todos.alerts).toHaveBeenCalledWith(COMPANY, USER, ability, {
      scope: 'mine',
      summary: true,
    });
    expect(comercial.getAlerts).not.toHaveBeenCalled();
    expect(operations.getKpis).not.toHaveBeenCalled();
    for (const model of [
      tx.hsecIncident,
      tx.campaign,
      tx.employeeContract,
      tx.employeeDocument,
      tx.certification,
    ])
      expect(model.count).not.toHaveBeenCalled();
  });

  it('does not query any source when no module can be read', async () => {
    const { service, rls, comercial, todos, operations } = setup();
    expect(await service.getStatus(COMPANY, USER, reads())).toEqual({ lines: [] });
    expect(rls.executeWithRls).not.toHaveBeenCalled();
    expect(comercial.getAlerts).not.toHaveBeenCalled();
    expect(todos.alerts).not.toHaveBeenCalled();
    expect(operations.getKpis).not.toHaveBeenCalled();
  });

  it.each([OpportunitySubject, QuoteSubject])(
    'requires BOTH commercial read grants (%p alone is insufficient)',
    async (subject) => {
      const { service, comercial } = setup();
      expect(await service.getStatus(COMPANY, USER, reads(subject))).toEqual({ lines: [] });
      expect(comercial.getAlerts).not.toHaveBeenCalled();
      expect(
        await service.getStatus(COMPANY, USER, reads(OpportunitySubject, QuoteSubject)),
      ).toEqual({ lines: [zeroLines[3]] });
      expect(comercial.getAlerts).toHaveBeenCalledWith(COMPANY, true);
    },
  );

  it('uses zero wording and kind for every source', async () => {
    expect(await setup().service.getStatus(COMPANY, USER, admin)).toEqual({ lines: zeroLines });
  });

  it.each([
    [
      1,
      [
        '1 movimiento sin categorizar',
        '1 alerta activa · 1 crítica',
        '1 incidente · últimos 30 días',
        '1 alerta comercial',
        '1 campaña activa',
        '1 vencimiento en 30 días',
        '1 tarea vencida · 1 vence hoy o mañana',
      ],
    ],
    [
      3,
      [
        '3 movimientos sin categorizar',
        '3 alertas activas · 3 críticas',
        '3 incidentes · últimos 30 días',
        '3 alertas comerciales',
        '3 campañas activas',
        '3 vencimientos en 30 días',
        '3 tareas vencidas · 3 vencen hoy o mañana',
      ],
    ],
  ] as const)('uses positive kinds and singular/plural wording for %i', async (count, messages) => {
    const { lines } = await setup(count).service.getStatus(COMPANY, USER, admin);
    expect(lines).toEqual(
      zeroLines.map((line, index) => ({
        moduleKey: line.moduleKey,
        kind: line.moduleKey === 'marketing' ? 'informativo' : 'atencion',
        message: messages[index],
      })),
    );
  });

  it.each([
    [1, 0, '1 tarea vencida'],
    [0, 1, '1 vence hoy o mañana'],
    [2, 0, '2 tareas vencidas'],
    [0, 2, '2 vencen hoy o mañana'],
  ])('omits the zero task part (%i overdue, %i due soon)', async (overdue, dueSoon, message) => {
    const { service, todos } = setup();
    todos.alerts.mockResolvedValue({
      counts: { overdue, dueSoon, total: Number(overdue) + Number(dueSoon) },
    });
    expect(await service.getStatus(COMPANY, USER, reads(TodoSubject))).toEqual({
      lines: [{ moduleKey: 'gestion', kind: 'atencion', message }],
    });
  });

  it('GO-003: counts all open states through the real todo alerts service, excluding DONE', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-16T15:00:00Z'));
    const rows = ['PENDING', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE'].flatMap((status) => [
      { companyId: COMPANY, assigneeId: USER, status, dueDate: new Date('2026-09-15') },
      { companyId: COMPANY, assigneeId: USER, status, dueDate: new Date('2026-09-16') },
      { companyId: COMPANY, assigneeId: 'other', status, dueDate: new Date('2026-09-15') },
      { companyId: 'foreign', assigneeId: USER, status, dueDate: new Date('2026-09-16') },
    ]);
    const count = jest.fn(
      async ({ where }) =>
        rows.filter(
          (row) =>
            row.companyId === where.companyId &&
            row.assigneeId === where.assigneeId &&
            where.status.in.includes(row.status) &&
            (!where.dueDate.lt || row.dueDate < where.dueDate.lt) &&
            (!where.dueDate.gte || row.dueDate >= where.dueDate.gte) &&
            (!where.dueDate.lte || row.dueDate <= where.dueDate.lte),
        ).length,
    );
    const rls = {
      executeWithRls: jest.fn(async (company, user, fn) => {
        expect([company, user]).toEqual([COMPANY, USER]);
        return fn({ todo: { count } });
      }),
    };
    const todos = new TodosService(rls as never, {} as never);
    const service = new HubService(rls as never, {} as never, todos, {} as never);
    expect(await service.getStatus(COMPANY, USER, reads(TodoSubject))).toEqual({
      lines: [
        {
          moduleKey: 'gestion',
          kind: 'atencion',
          message: '4 tareas vencidas · 4 vencen hoy o mañana',
        },
      ],
    });
    expect(count).toHaveBeenCalledTimes(2);
  });

  it('omits the critical suffix when there are no critical alerts', async () => {
    const { service, operations } = setup();
    operations.getKpis.mockResolvedValue({ active: 2, critical: 0 });
    expect(await service.getStatus(COMPANY, USER, reads(AlertRuleSubject))).toEqual({
      lines: [{ moduleKey: 'operaciones', kind: 'atencion', message: '2 alertas activas' }],
    });
    expect(operations.getKpis).toHaveBeenCalledWith(COMPANY);
  });

  it.each(Object.values(UserRole))('keeps task scope mine even for %s', async (role) => {
    const { service, todos } = setup();
    const ability = factory.defineAbilityFor(role);
    await service.getStatus(COMPANY, USER, ability);
    expect(todos.alerts).toHaveBeenCalledWith(COMPANY, USER, ability, {
      scope: 'mine',
      summary: true,
    });
  });

  it('omits only a rejected source, logs its module, and does not turn failure into a zero', async () => {
    const { service, comercial } = setup();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    comercial.getAlerts.mockRejectedValue(new Error('unavailable'));
    expect(await service.getStatus(COMPANY, USER, admin)).toEqual({
      lines: zeroLines.filter((line) => line.moduleKey !== 'comercial'),
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('comercial'));
  });

  it('isolates a failure in a direct count source too', async () => {
    const { service, tx } = setup();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    tx.certification.count.mockRejectedValue(new Error('unavailable'));
    expect(await service.getStatus(COMPANY, USER, admin)).toEqual({
      lines: zeroLines.filter((line) => line.moduleKey !== 'rrhh'),
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('rrhh'));
  });

  it('starts all authorized sources before any source has to finish', async () => {
    const { service, comercial, operations, todos } = setup();
    let release!: (value: { counts: { total: number } }) => void;
    comercial.getAlerts.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const pending = service.getStatus(COMPANY, USER, admin);
    expect(comercial.getAlerts).toHaveBeenCalled();
    expect(operations.getKpis).toHaveBeenCalled();
    expect(todos.alerts).toHaveBeenCalled();
    release({ counts: { total: 0 } });
    expect(await pending).toEqual({ lines: zeroLines });
  });

  it('uses company predicates on every new query and RLS with the caller on every new read path', async () => {
    const { service, tx, rls } = setup();
    await service.getStatus(COMPANY, USER, admin);
    expect(rls.executeWithRls).toHaveBeenCalledTimes(4);
    for (const call of rls.executeWithRls.mock.calls)
      expect(call.slice(0, 2)).toEqual([COMPANY, USER]);
    expect(tx.category.findMany).toHaveBeenCalledWith({
      where: {
        companyId: COMPANY,
        name: 'Productos no categorizados',
        type: { in: ['INCOME', 'EXPENSE'] },
      },
      select: { id: true },
    });
    for (const model of [
      tx.movement,
      tx.hsecIncident,
      tx.campaign,
      tx.employeeContract,
      tx.employeeDocument,
      tx.certification,
    ]) {
      expect(model.count).toHaveBeenCalledTimes(1);
      expect(model.count).toHaveBeenCalledWith({
        where: expect.objectContaining({ companyId: COMPANY }),
      });
    }
    expect(tx.movement.count).toHaveBeenCalledWith({
      where: { companyId: COMPANY, categoryId: { in: ['default-income', 'default-expense'] } },
    });
    expect(tx.campaign.count).toHaveBeenCalledWith({
      where: { companyId: COMPANY, status: 'ACTIVA' },
    });
  });

  it('does not count all movements when the default category IDs are absent', async () => {
    const { service, tx } = setup();
    tx.category.findMany.mockResolvedValue([]);
    await service.getStatus(COMPANY, USER, reads(MovementSubject));
    expect(tx.movement.count).toHaveBeenCalledWith({
      where: { companyId: COMPANY, categoryId: { in: [] } },
    });
  });

  it.each([
    ['2026-09-18T02:59:59Z', '2026-09-17', '2026-08-19', '2026-09-18', '2026-10-17'],
    ['2026-09-18T03:00:00Z', '2026-09-18', '2026-08-20', '2026-09-19', '2026-10-18'],
    // Santiago winter offset and a window crossing the DST transition.
    ['2026-09-05T03:30:00Z', '2026-09-04', '2026-08-06', '2026-09-05', '2026-10-04'],
  ])(
    'uses Santiago civil days at %s and mirrors reminder eligibility without overdue items',
    async (instant, today, oldest, tomorrow, horizon) => {
      jest.useFakeTimers().setSystemTime(new Date(instant));
      const { service, tx } = setup();
      tx.employeeContract.count.mockResolvedValue(2);
      tx.employeeDocument.count.mockResolvedValue(3);
      tx.certification.count.mockResolvedValue(4);
      const { lines } = await service.getStatus(
        COMPANY,
        USER,
        reads(HsecIncidentSubject, EmployeeSubject),
      );
      expect(lines[1]).toEqual({
        moduleKey: 'rrhh',
        kind: 'atencion',
        message: '9 vencimientos en 30 días',
      });
      expect(tx.hsecIncident.count).toHaveBeenCalledWith({
        where: {
          companyId: COMPANY,
          occurredDate: { gte: new Date(oldest), lt: new Date(tomorrow) },
        },
      });
      const window = { gte: new Date(today), lte: new Date(horizon) };
      expect(tx.employeeContract.count).toHaveBeenCalledWith({
        where: {
          companyId: COMPANY,
          status: 'VIGENTE',
          contractType: { in: ['PLAZO_FIJO', 'POR_OBRA'] },
          parentContractId: null,
          endDate: window,
        },
      });
      expect(tx.employeeDocument.count).toHaveBeenCalledWith({
        where: { companyId: COMPANY, status: 'APPROVED', supersededById: null, expiryDate: window },
      });
      expect(tx.certification.count).toHaveBeenCalledWith({
        where: { companyId: COMPANY, status: 'VIGENTE', expiryDate: window },
      });
    },
  );
});
