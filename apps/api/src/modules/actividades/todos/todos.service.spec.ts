import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Todo, TodoStatus, UserRole } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CaslAbilityFactory } from '../../common/casl/casl-ability.factory';
import {
  ChangeTodoStatusDto,
  CreateTodoDto,
  FilterTodoAlertsDto,
  FilterTodosDto,
  UpdateTodoDto,
} from './dto/todo.dto';
import { OPEN_TODO_STATUSES } from './todo-status';
import { TodosController } from './todos.controller';
import { TodosService } from './todos.service';

type Any = Record<string, unknown>;
const ability = (role: UserRole) => new CaslAbilityFactory().defineAbilityFor(role);
const manager = ability(UserRole.MANAGER),
  viewer = ability(UserRole.VIEWER);
const NOW = new Date('2026-09-16T15:00:00Z');
const seed = (values: Partial<Todo> = {}): Todo => ({
  id: 't1',
  companyId: 'c1',
  title: 'Revisar contrato',
  description: null,
  status: 'PENDING',
  priority: 'MEDIUM',
  dueDate: null,
  assigneeId: 'u2',
  createdBy: 'u1',
  completedAt: null,
  completedBy: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...values,
});

function setup(initial: Todo[] = []) {
  const rows = initial.map((row) => ({ ...row }));
  const members = [
    {
      id: 'm1',
      companyId: 'c1',
      userId: 'u1',
      isActive: true,
      user: { id: 'u1', firstName: 'Ana', lastName: 'Zapata', email: 'ana@example.test' },
    },
    {
      id: 'm2',
      companyId: 'c1',
      userId: 'u2',
      isActive: true,
      user: { id: 'u2', firstName: 'Luis', lastName: 'Bravo', email: 'luis@example.test' },
    },
    {
      id: 'm3',
      companyId: 'c1',
      userId: 'u3',
      isActive: true,
      user: { id: 'u3', firstName: 'Ana', lastName: 'Bravo', email: 'ana.b@example.test' },
    },
    {
      id: 'm4',
      companyId: 'c1',
      userId: 'inactive',
      isActive: false,
      user: {
        id: 'inactive',
        firstName: 'Inactivo',
        lastName: 'A',
        email: 'inactive@example.test',
      },
    },
    {
      id: 'm5',
      companyId: 'other',
      userId: 'foreign',
      isActive: true,
      user: { id: 'foreign', firstName: 'Ajeno', lastName: 'A', email: 'foreign@example.test' },
    },
  ];
  let inRls = false,
    sequence = 0;
  const scoped = (where: Any) => {
    expect(inRls).toBe(true);
    expect(where.companyId).toBe('c1');
  };
  const matches = (row: Todo, where: Any): boolean =>
    Object.entries(where).every(([key, value]) => {
      if (key === 'OR') return (value as Any[]).some((part) => matches(row, part));
      const actual = row[key as keyof Todo];
      if (key === 'status' && typeof value === 'object')
        return (value as { in: TodoStatus[] }).in.includes(row.status);
      if (key === 'dueDate' || key === 'completedAt') {
        const range = value as { lt?: Date; lte?: Date; gte?: Date };
        return (
          actual instanceof Date &&
          (!range.lt || actual < range.lt) &&
          (!range.lte || actual <= range.lte) &&
          (!range.gte || actual >= range.gte)
        );
      }
      if (actual instanceof Date && value instanceof Date)
        return actual.getTime() === value.getTime();
      return actual === value;
    });
  const todo = {
    findFirst: jest.fn(async ({ where }: { where: Any }) => {
      scoped(where);
      const row = rows.find((row) => matches(row, where));
      return row ? { ...row } : null;
    }),
    findMany: jest.fn(async ({ where, orderBy }: { where: Any; orderBy: unknown }) => {
      scoped(where);
      const alertOrder = Array.isArray(orderBy) && 'priority' in orderBy[1];
      expect(orderBy).toEqual(
        alertOrder
          ? [{ dueDate: 'asc' }, { priority: 'desc' }, { id: 'asc' }]
          : [{ status: 'asc' }, { dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      );
      return rows
        .filter((row) => matches(row, where))
        .sort((a, b) => {
          if (!alertOrder && a.status !== b.status)
            return (
              Object.values(TodoStatus).indexOf(a.status) -
              Object.values(TodoStatus).indexOf(b.status)
            );
          const due = (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity);
          const priorities = { LOW: 0, MEDIUM: 1, HIGH: 2 };
          return (
            (Number.isNaN(due) ? 0 : due) ||
            (alertOrder
              ? priorities[b.priority] - priorities[a.priority] || a.id.localeCompare(b.id)
              : b.createdAt.getTime() - a.createdAt.getTime())
          );
        });
    }),
    count: jest.fn(async ({ where }: { where: Any }) => {
      scoped(where);
      return rows.filter((row) => matches(row, where)).length;
    }),
    create: jest.fn(async ({ data }: { data: Partial<Todo> }) => {
      scoped(data as Any);
      const row = seed({ ...data, id: `new-${++sequence}` });
      rows.push(row);
      return row;
    }),
    updateMany: jest.fn(async ({ where, data }: { where: Any; data: Partial<Todo> }) => {
      scoped(where);
      const found = rows.filter((row) => matches(row, where));
      for (const row of found)
        Object.assign(row, data, { updatedAt: new Date(NOW.getTime() + ++sequence) });
      return { count: found.length };
    }),
    update: jest.fn(async ({ where, data }: { where: Any; data: Partial<Todo> }) => {
      scoped(where);
      const row = rows.find((r) => matches(r, where));
      Object.assign(row as Todo, data);
      return row;
    }),
    delete: jest.fn(async ({ where }: { where: Any }) => {
      scoped(where);
      rows.splice(
        rows.findIndex((row) => matches(row, where)),
        1,
      );
    }),
  };
  const membership = {
    findFirst: jest.fn(async ({ where }: { where: Any }) => {
      scoped(where);
      return (
        members.find((m) =>
          Object.entries(where).every(([k, v]) => m[k as keyof typeof m] === v),
        ) ?? null
      );
    }),
    findMany: jest.fn(async ({ where, orderBy }: { where: Any; orderBy: unknown }) => {
      scoped(where);
      expect(orderBy).toEqual([{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }]);
      return members
        .filter(
          (m) =>
            m.companyId === where.companyId &&
            (where.isActive === undefined || m.isActive === where.isActive) &&
            (!where.userId || (where.userId as { in: string[] }).in.includes(m.userId)),
        )
        .sort(
          (a, b) =>
            a.user.lastName.localeCompare(b.user.lastName) ||
            a.user.firstName.localeCompare(b.user.firstName),
        )
        .map(({ user }) => ({ user }));
    }),
  };
  const rls = {
    executeWithRls: jest.fn(
      async (company: string, actor: string, fn: (tx: unknown) => Promise<unknown>) => {
        expect(company).toBe('c1');
        expect(actor).toBeTruthy();
        inRls = true;
        try {
          return await fn({ todo, membership });
        } finally {
          inRls = false;
        }
      },
    ),
  };
  const notifications = {
    createGeneric: jest.fn(async () => {
      expect(inRls).toBe(false);
      return { delivered: 1 };
    }),
  };
  return {
    svc: new TodosService(rls as never, notifications as never),
    rows,
    todo,
    membership,
    rls,
    notifications,
  };
}

const filters = (values: Partial<FilterTodosDto> = {}) => ({ ...new FilterTodosDto(), ...values });

describe('GO-001 TodosService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });
  afterEach(() => jest.useRealTimers());

  it.each(['missing', 'foreign', 'inactive'])(
    'rejects non-active company member %s',
    async (assigneeId) => {
      const { svc, todo, notifications } = setup();
      await expect(svc.create('c1', 'u1', { title: 'Tarea', assigneeId })).rejects.toThrow(
        'El usuario asignado no pertenece a la organización.',
      );
      expect(todo.create).not.toHaveBeenCalled();
      expect(notifications.createGeneric).not.toHaveBeenCalled();
    },
  );
  it('takes actor from JWT, trims title, ignores spoofed fields, notifies another assignee after RLS write', async () => {
    const { svc, notifications, rls } = setup();
    const controller = new TodosController(svc);
    const row = await controller.create('c1', { id: 'u1' }, {
      title: '  Informe  ',
      assigneeId: 'u2',
      createdBy: 'attacker',
      status: 'DONE',
    } as never);
    expect(row).toMatchObject({
      title: 'Informe',
      createdBy: 'u1',
      status: 'PENDING',
      priority: 'MEDIUM',
    });
    expect(rls.executeWithRls).toHaveBeenCalledWith('c1', 'u1', expect.any(Function));
    expect(notifications.createGeneric).toHaveBeenCalledWith('c1', {
      userIds: ['u2'],
      sourceType: 'GENERAL',
      severity: 'INFO',
      title: 'Nuevo to-do asignado',
      message: 'Informe',
      linkPath: '/actividades/todos',
      icon: 'CheckCheck',
    });
  });
  it('does not notify self-assignment', async () => {
    const { svc, notifications } = setup();
    await svc.create('c1', 'u1', { title: 'Tarea', assigneeId: 'u1' });
    expect(notifications.createGeneric).not.toHaveBeenCalled();
  });
  it('reassignment notifies exactly once; title edits and reassignment to self do not', async () => {
    const { svc, notifications } = setup([seed()]);
    await svc.update('t1', 'c1', 'u1', { assigneeId: 'u3' });
    await svc.update('t1', 'c1', 'u1', { title: 'Cambió', assigneeId: 'u3' });
    await svc.update('t1', 'c1', 'u1', { assigneeId: 'u1' });
    expect(notifications.createGeneric).toHaveBeenCalledTimes(1);
    expect(notifications.createGeneric.mock.calls[0]).toEqual([
      'c1',
      expect.objectContaining({ userIds: ['u3'] }),
    ]);
  });
  it('rejects invalid reassignment and editing DONE rows', async () => {
    const { svc, todo } = setup([seed(), seed({ id: 'done', status: 'DONE' })]);
    await expect(svc.update('t1', 'c1', 'u1', { assigneeId: 'foreign' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(svc.update('done', 'c1', 'u1', { title: 'No' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(todo.updateMany).not.toHaveBeenCalled();
  });
  it.each([UserRole.VIEWER, UserRole.ACCOUNTANT, UserRole.ANALYST])(
    'forces mine for %s even with all/foreign assignee query',
    async (role) => {
      const { svc } = setup([
        seed(),
        seed({ id: 'other', assigneeId: 'u3' }),
        seed({ id: 'foreign', companyId: 'other' }),
      ]);
      expect(
        (
          await svc.findAll('c1', 'u2', ability(role), filters({ scope: 'all', assigneeId: 'u3' }))
        ).map((r) => r.id),
      ).toEqual(['t1']);
    },
  );
  it('honours writer all, assignee/status/dueBefore filters; mine is the default', async () => {
    const { svc } = setup([
      seed({ dueDate: new Date('2026-09-10') }),
      seed({ id: 'mine', assigneeId: 'u1' }),
      seed({ id: 'done', status: 'DONE' }),
    ]);
    expect((await svc.findAll('c1', 'u1', manager, filters())).map((r) => r.id)).toEqual(['mine']);
    expect(
      (
        await svc.findAll(
          'c1',
          'u1',
          manager,
          filters({ scope: 'all', assigneeId: 'u2', dueBefore: '2026-09-11' }),
        )
      ).map((r) => r.id),
    ).toEqual(['t1']);
    expect(
      (await svc.findAll('c1', 'u1', manager, filters({ scope: 'all', status: 'DONE' }))).map(
        (r) => r.id,
      ),
    ).toEqual(['done']);
  });
  it('sorts pending before done, due dates ascending/nulls last, ties newest first', async () => {
    const { svc } = setup([
      seed({ id: 'done', status: 'DONE', dueDate: new Date('2026-01-01') }),
      seed({ id: 'null' }),
      seed({ id: 'later', dueDate: new Date('2026-10-01') }),
      seed({ id: 'older', dueDate: new Date('2026-09-01'), createdAt: new Date('2026-01-01') }),
      seed({ id: 'newer', dueDate: new Date('2026-09-01') }),
    ]);
    expect(
      (await svc.findAll('c1', 'u1', manager, filters({ scope: 'all', status: 'ALL' }))).map(
        (r) => r.id,
      ),
    ).toEqual(['newer', 'older', 'later', 'null', 'done']);
  });
  it('lists active assignees only, sorted by surname/name, with exactly the four approved fields', async () => {
    const { svc } = setup();
    const people = await svc.assignees('c1', 'u1');
    expect(people.map((p) => p.id)).toEqual(['u3', 'u2', 'u1']);
    expect(Object.keys(people[0]).sort()).toEqual(['email', 'firstName', 'id', 'lastName']);
  });
  it('resolves names in one company-scoped batch and does not expose email in list rows', async () => {
    const { svc, membership } = setup([seed(), seed({ id: 'second', assigneeId: 'u3' })]);
    const rows = await svc.findAll('c1', 'u1', manager, filters({ scope: 'all' }));
    expect(membership.findMany).toHaveBeenCalledTimes(1);
    expect(rows[0]).toMatchObject({
      assignee: { id: 'u2', firstName: 'Luis', lastName: 'Bravo' },
      createdByName: 'Ana Zapata',
    });
    expect(rows[0].assignee).not.toHaveProperty('email');
  });
  it('assignee with VIEWER completes own; second completion preserves actor/time', async () => {
    const { svc, todo } = setup([seed()]);
    const first = await svc.complete('t1', 'c1', 'u2', viewer);
    jest.setSystemTime(new Date('2026-09-17T15:00:00Z'));
    const second = await svc.complete('t1', 'c1', 'u2', viewer);
    expect(second).toMatchObject({
      status: 'DONE',
      completedBy: 'u2',
      completedAt: first.completedAt,
    });
    expect(todo.updateMany).toHaveBeenCalledTimes(1);
  });
  it('rejects a non-assignee reader but permits MANAGER to complete', async () => {
    const { svc } = setup([seed()]);
    await expect(svc.complete('t1', 'c1', 'u3', viewer)).rejects.toBeInstanceOf(ForbiddenException);
    expect(await svc.complete('t1', 'c1', 'u1', manager)).toMatchObject({
      status: 'DONE',
      completedBy: 'u1',
    });
  });
  it('reopen requires update and clears completion fields', async () => {
    const { svc } = setup([seed({ status: 'DONE', completedAt: NOW, completedBy: 'u2' })]);
    await expect(svc.reopen('t1', 'c1', 'u2', viewer)).rejects.toBeInstanceOf(ForbiddenException);
    expect(await svc.reopen('t1', 'c1', 'u1', manager)).toMatchObject({
      status: 'PENDING',
      completedAt: null,
      completedBy: null,
    });
  });
  it('reopening an already pending row does not write', async () => {
    const { svc, todo } = setup([seed()]);
    expect(await svc.reopen('t1', 'c1', 'u1', manager)).toMatchObject({ status: 'PENDING' });
    expect(todo.updateMany).not.toHaveBeenCalled();
  });
  it('reopen rejects a concurrent change instead of overwriting it', async () => {
    const { svc, todo, rows } = setup([
      seed({ status: 'DONE', completedAt: NOW, completedBy: 'u2' }),
    ]);
    todo.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(svc.reopen('t1', 'c1', 'u1', manager)).rejects.toBeInstanceOf(ConflictException);
    expect(todo.updateMany).toHaveBeenCalledWith({
      where: { id: 't1', companyId: 'c1', status: 'DONE', assigneeId: 'u2', updatedAt: NOW },
      data: { status: 'PENDING', completedAt: null, completedBy: null },
    });
    expect(rows[0]).toMatchObject({ status: 'DONE', completedAt: NOW, completedBy: 'u2' });
  });
  it('creator can delete; another MANAGER cannot; ADMIN can', async () => {
    const { svc, rows } = setup([seed(), seed({ id: 'second' })]);
    await expect(svc.remove('t1', 'c1', 'u3', manager)).rejects.toBeInstanceOf(ForbiddenException);
    await svc.remove('t1', 'c1', 'u1', manager);
    await svc.remove('second', 'c1', 'u3', ability(UserRole.ADMIN));
    expect(rows).toHaveLength(0);
  });
  it('returns 404 for foreign/missing rows across all mutations', async () => {
    const { svc } = setup([seed({ companyId: 'other' })]);
    for (const id of ['t1', 'missing']) {
      await expect(svc.update(id, 'c1', 'u1', { title: 'X' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(svc.complete(id, 'c1', 'u1', manager)).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.reopen(id, 'c1', 'u1', manager)).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.remove(id, 'c1', 'u1', manager)).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.changeStatus(id, 'c1', 'u1', manager, 'IN_PROGRESS')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    }
  });
  it('uses date-only values and Santiago today for overdue (due today is not late)', async () => {
    jest.setSystemTime(new Date('2026-09-17T01:00:00Z')); // Still September 16 in Santiago.
    const { svc } = setup([
      seed({ dueDate: new Date('2026-09-16') }),
      seed({ id: 'late', dueDate: new Date('2026-09-15') }),
      seed({ id: 'done', status: 'DONE', dueDate: new Date('2026-09-15') }),
    ]);
    const rows = await svc.findAll('c1', 'u2', viewer, filters({ status: 'ALL' }));
    expect(rows.filter((r) => r.overdue).map((r) => r.id)).toEqual(['late']);
    const row = await svc.create('c1', 'u1', {
      title: 'Fecha',
      dueDate: '2026-09-16',
      assigneeId: 'u1',
    });
    expect(row.dueDate?.toISOString()).toBe('2026-09-16T00:00:00.000Z');
    expect(
      await svc.update(row.id, 'c1', 'u1', { dueDate: null, description: null }),
    ).toMatchObject({ dueDate: null, description: null });
  });
});

const BOARD_STATUSES: TodoStatus[] = ['PENDING', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE'];
const OPEN_STATUSES = BOARD_STATUSES.slice(0, 4);

describe('GO-003 board states', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });
  afterEach(() => jest.useRealTimers());

  it('exposes all five enum values in board order and exactly four open states', () => {
    expect(Object.values(TodoStatus)).toEqual(BOARD_STATUSES);
    expect(OPEN_TODO_STATUSES).toEqual(OPEN_STATUSES);
  });

  it('defaults to OPEN, keeps each explicit status exact, and sorts ALL with DONE last', async () => {
    const { svc } = setup(
      [...BOARD_STATUSES].reverse().map((status) => seed({ id: status, status })),
    );
    expect(new FilterTodosDto().status).toBe('OPEN');
    for (const status of [undefined, 'OPEN', 'ALL', ...BOARD_STATUSES] as const) {
      const rows = await svc.findAll('c1', 'u2', viewer, filters({ status }));
      expect(rows.map((row) => row.status)).toEqual(
        status === undefined || status === 'OPEN'
          ? OPEN_STATUSES
          : status === 'ALL'
            ? BOARD_STATUSES
            : [status],
      );
    }
  });

  it.each([
    ['2026-01-15', '2026-01-15T03:00:00.000Z'],
    ['2026-07-15', '2026-07-15T04:00:00.000Z'],
    ['2026-04-05', '2026-04-05T04:00:00.000Z'],
    ['2026-09-06', '2026-09-06T04:00:00.000Z'],
  ])(
    'bounds only DONE by the first Santiago instant of %s (including DST)',
    async (completedAfter, start) => {
      const boundary = new Date(start);
      const { svc } = setup([
        ...OPEN_STATUSES.map((status) => seed({ id: status, status })),
        seed({ id: 'old', status: 'DONE', completedAt: new Date(boundary.getTime() - 1) }),
        seed({ id: 'boundary', status: 'DONE', completedAt: boundary }),
        seed({ id: 'later', status: 'DONE', completedAt: new Date(boundary.getTime() + 1) }),
        seed({ id: 'unknown', status: 'DONE', completedAt: null }),
        seed({ id: 'foreign', companyId: 'other', status: 'DONE', completedAt: boundary }),
        seed({ id: 'other-assignee', assigneeId: 'u3', status: 'DONE', completedAt: boundary }),
      ]);
      for (const status of ['ALL', 'OPEN', 'DONE', 'IN_PROGRESS'] as const) {
        const rows = await svc.findAll('c1', 'u2', viewer, filters({ status, completedAfter }));
        expect(rows.map((row) => row.id)).toEqual(
          status === 'ALL'
            ? [...OPEN_STATUSES, 'boundary', 'later']
            : status === 'OPEN'
              ? OPEN_STATUSES
              : status === 'DONE'
                ? ['boundary', 'later']
                : ['IN_PROGRESS'],
        );
      }
    },
  );

  it.each(Object.values(UserRole))(
    'computes flags and overdue for every state for %s',
    async (role) => {
      const { svc } = setup(
        BOARD_STATUSES.map((status) =>
          seed({ id: status, status, dueDate: new Date('2026-09-15') }),
        ),
      );
      const rows = await svc.findAll('c1', 'u2', ability(role), filters({ status: 'ALL' }));
      const editor = [UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(
        role as never,
      );
      for (const row of rows) {
        expect(row.overdue).toBe(row.status !== 'DONE');
        expect(row.canComplete).toBe(row.status !== 'DONE');
        expect(row.canChangeStatus).toBe(row.status !== 'DONE' || editor);
        expect(row.canDelete).toBe(role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN);
      }
    },
  );

  const transitions = Object.values(UserRole).flatMap((role) =>
    [true, false].flatMap((owns) =>
      BOARD_STATUSES.flatMap((from) => BOARD_STATUSES.map((to) => ({ role, owns, from, to }))),
    ),
  );
  it.each(transitions)('$role owns=$owns: $from → $to', async ({ role, owns, from, to }) => {
    const original = seed({
      status: from,
      completedAt: from === 'DONE' ? NOW : null,
      completedBy: from === 'DONE' ? 'u2' : null,
    });
    const { svc, todo, notifications } = setup([original]);
    const actor = owns ? 'u2' : 'u3';
    const editor =
      role === UserRole.MANAGER || role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;
    const allowed = editor || (owns && (from !== 'DONE' || to === 'DONE'));
    const result = svc.changeStatus('t1', 'c1', actor, ability(role), to);
    if (!allowed) {
      await expect(result).rejects.toBeInstanceOf(ForbiddenException);
      expect(todo.updateMany).not.toHaveBeenCalled();
    } else {
      const row = await result;
      expect(row.status).toBe(to);
      if (from === to) {
        expect(row).toEqual(original);
        expect(todo.updateMany).not.toHaveBeenCalled();
      } else {
        expect(row.completedAt).toEqual(to === 'DONE' ? NOW : null);
        expect(row.completedBy).toBe(to === 'DONE' ? actor : null);
        expect(todo.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 't1', companyId: 'c1', status: from, assigneeId: 'u2', updatedAt: NOW },
          }),
        );
      }
    }
    expect(notifications.createGeneric).not.toHaveBeenCalled();
  });

  it.each([
    { status: 'BLOCKED' as const },
    { status: 'DONE' as const },
    { assigneeId: 'u3' },
    { updatedAt: new Date(NOW.getTime() + 1) },
  ])(
    'rejects lost CAS without overwriting %j, even when the race also completes',
    async (concurrent) => {
      const { svc, todo, rows } = setup([seed({ status: 'IN_PROGRESS' })]);
      const write = todo.updateMany.getMockImplementation();
      if (!write) throw new Error('Missing compare-and-set mock');
      todo.updateMany.mockImplementationOnce((args) => {
        Object.assign(rows[0], concurrent);
        return write(args);
      });
      await expect(svc.changeStatus('t1', 'c1', 'u2', viewer, 'DONE')).rejects.toMatchObject({
        status: 409,
        message: 'El to-do cambió mientras lo editabas; recarga e inténtalo de nuevo.',
      });
      expect(rows[0]).toMatchObject(concurrent);
    },
  );

  it.each(OPEN_STATUSES)(
    'complete handles %s and reopen preserves already-open work',
    async (status) => {
      const { svc, todo } = setup([seed({ status })]);
      expect(await svc.reopen('t1', 'c1', 'u1', manager)).toMatchObject({ status });
      expect(todo.updateMany).not.toHaveBeenCalled();
      expect(await svc.complete('t1', 'c1', 'u2', viewer)).toMatchObject({
        status: 'DONE',
        completedBy: 'u2',
        completedAt: NOW,
      });
      expect(await svc.reopen('t1', 'c1', 'u1', manager)).toMatchObject({
        status: 'PENDING',
        completedBy: null,
        completedAt: null,
      });
    },
  );

  it('edits IN_PROGRESS using open-state and updatedAt CAS', async () => {
    const { svc, todo } = setup([seed({ status: 'IN_PROGRESS' })]);
    expect(await svc.update('t1', 'c1', 'u1', { title: 'En marcha' })).toMatchObject({
      title: 'En marcha',
      status: 'IN_PROGRESS',
    });
    expect(todo.updateMany).toHaveBeenCalledWith({
      where: { id: 't1', companyId: 'c1', status: { in: OPEN_STATUSES }, updatedAt: NOW },
      data: { title: 'En marcha' },
    });
  });

  it('forwards status changes using the authenticated actor and company', async () => {
    const { svc } = setup([seed()]);
    const controller = new TodosController(svc);
    expect(
      await controller.changeStatus('t1', 'c1', { id: 'u2' }, viewer, { status: 'IN_REVIEW' }),
    ).toMatchObject({ status: 'IN_REVIEW' });
  });

  it('includes all open states in overdue/dueSoon rows and summary, excluding DONE', async () => {
    const { svc } = setup(
      BOARD_STATUSES.flatMap((status) => [
        seed({ id: `late-${status}`, status, dueDate: new Date('2026-09-15') }),
        seed({ id: `today-${status}`, status, dueDate: new Date('2026-09-16') }),
        seed({ id: `tomorrow-${status}`, status, dueDate: new Date('2026-09-17') }),
      ]),
    );
    const full = await svc.alerts('c1', 'u2', viewer, alertFilters());
    expect(full.counts).toEqual({ overdue: 4, dueSoon: 8, total: 12 });
    expect(full.overdue?.map((row) => row.status).sort()).toEqual([...OPEN_STATUSES].sort());
    expect(
      full.dueSoon?.every((row) => row.status !== 'DONE' && row.canComplete && row.canChangeStatus),
    ).toBe(true);
    expect(await svc.alerts('c1', 'u2', viewer, alertFilters({ summary: true }))).toEqual({
      counts: full.counts,
    });
  });

  it.each([...BOARD_STATUSES, 'OPEN', 'ALL'])('accepts list status %s', async (status) => {
    expect(await validate(plainToInstance(FilterTodosDto, { status }))).toEqual([]);
  });

  it.each(BOARD_STATUSES)('accepts transition status %s', async (status) => {
    expect(await validate(plainToInstance(ChangeTodoStatusDto, { status }))).toEqual([]);
  });

  it.each([undefined, null, '', 'OPEN', 'ALL', 'CANCELLED'])(
    'returns 400 for invalid transition status %s',
    async (status) => {
      await expect(
        new ValidationPipe({ transform: true }).transform(
          { status },
          { type: 'body', metatype: ChangeTodoStatusDto },
        ),
      ).rejects.toMatchObject({ status: 400 });
    },
  );

  it.each(['2026-02-30', '2026-09-16T00:00:00Z', 'bad'])(
    'returns 400 for completedAfter=%s',
    async (completedAfter) => {
      await expect(
        new ValidationPipe({ transform: true }).transform(
          { completedAfter },
          { type: 'query', metatype: FilterTodosDto },
        ),
      ).rejects.toMatchObject({ status: 400 });
    },
  );
});

describe('GO-001 DTO validation', () => {
  const valid = { title: ' Tarea ', assigneeId: '00000000-0000-4000-8000-000000000001' };
  it('trims input and allows nullable date/description for clearing', async () => {
    const dto = plainToInstance(CreateTodoDto, { ...valid, description: '   ' });
    expect(await validate(dto)).toEqual([]);
    expect(dto.title).toBe('Tarea');
    expect(dto.description).toBeNull();
    expect(
      await validate(plainToInstance(UpdateTodoDto, { dueDate: null, description: null })),
    ).toEqual([]);
  });
  it.each([
    { title: '   ' },
    { title: 'x'.repeat(201) },
    { description: 'x'.repeat(2001) },
    { assigneeId: 'not-uuid' },
    { priority: null },
    { priority: 'URGENT' },
    { dueDate: '2026-02-30' },
    { dueDate: '2026-09-16T00:00:00Z' },
  ])('rejects invalid fields %j', async (bad) => {
    expect(
      (await validate(plainToInstance(CreateTodoDto, { ...valid, ...bad }))).length,
    ).toBeGreaterThan(0);
  });
  it('PATCH rejects null title/assignee/priority and list validates scope/status/date', async () => {
    for (const key of ['title', 'assigneeId', 'priority'])
      expect(
        (await validate(plainToInstance(UpdateTodoDto, { [key]: null }))).length,
      ).toBeGreaterThan(0);
    expect(await validate(new FilterTodosDto())).toEqual([]);
    expect(
      (
        await validate(
          plainToInstance(FilterTodosDto, {
            scope: 'foreign',
            status: 'ANY',
            dueBefore: 'bad',
            assigneeId: 'bad',
          }),
        )
      ).length,
    ).toBe(4);
  });
});

const alertFilters = (values: Partial<FilterTodoAlertsDto> = {}) => ({
  ...new FilterTodoAlertsDto(),
  ...values,
});

describe('ALERT-002 live todo alerts', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // UTC is already the 17th; Santiago is still the 16th.
    jest.setSystemTime(new Date('2026-09-17T01:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());
  const dated = (id: string, date: string, values: Partial<Todo> = {}) =>
    seed({ id, dueDate: new Date(`${date}T00:00:00Z`), ...values });
  const mixed = () => [
    dated('yesterday', '2026-09-15'),
    dated('today-low', '2026-09-16', { priority: 'LOW' }),
    dated('tomorrow', '2026-09-17'),
    dated('day-after', '2026-09-18'),
    dated('today-high', '2026-09-16', { priority: 'HIGH' }),
    dated('today-medium', '2026-09-16'),
    dated('done', '2026-09-15', { status: 'DONE' }),
    dated('done-today', '2026-09-16', { status: 'DONE' }),
    dated('foreign', '2026-09-15', { companyId: 'other' }),
    seed({ id: 'no-date' }),
  ];

  it('uses Santiago boundaries, excludes DONE/null/foreign, sorts dates then HIGH to LOW and batches names once', async () => {
    const { svc, todo, membership, rls, notifications } = setup(mixed());
    const controller = new TodosController(svc);
    const result = await controller.alerts(
      'c1',
      { id: 'u1' },
      manager,
      alertFilters({ scope: 'all' }),
    );
    expect(result.counts).toEqual({ overdue: 1, dueSoon: 4, total: 5 });
    expect(result.overdue?.map((row) => row.id)).toEqual(['yesterday']);
    expect(result.dueSoon?.map((row) => row.id)).toEqual([
      'today-high',
      'today-medium',
      'today-low',
      'tomorrow',
    ]);
    expect(result.overdue?.[0]).toMatchObject({
      overdue: true,
      canComplete: true,
      assignee: { id: 'u2', firstName: 'Luis', lastName: 'Bravo' },
      createdByName: 'Ana Zapata',
    });
    expect(result.dueSoon?.every((row) => !row.overdue)).toBe(true);
    expect(todo.findMany).toHaveBeenCalledTimes(1);
    expect(membership.findMany).toHaveBeenCalledTimes(1);
    expect(membership.findMany.mock.calls[0][0].where).toEqual({
      companyId: 'c1',
      userId: { in: ['u2', 'u1'] },
    });
    expect(rls.executeWithRls).toHaveBeenCalledWith('c1', 'u1', expect.any(Function));
    expect(todo.create).not.toHaveBeenCalled();
    expect(todo.updateMany).not.toHaveBeenCalled();
    expect(todo.delete).not.toHaveBeenCalled();
    expect(notifications.createGeneric).not.toHaveBeenCalled();
  });

  it.each([UserRole.VIEWER, UserRole.ACCOUNTANT, UserRole.ANALYST])(
    'forces %s to mine in full and summary even when all is requested',
    async (role) => {
      const { svc, todo } = setup([
        dated('own', '2026-09-15'),
        dated('other', '2026-09-16', { assigneeId: 'u1' }),
      ]);
      const result = await svc.alerts('c1', 'u2', ability(role), alertFilters({ scope: 'all' }));
      expect(result.counts).toEqual({ overdue: 1, dueSoon: 0, total: 1 });
      expect(result.overdue?.[0]).toMatchObject({ id: 'own', canComplete: true });
      const summary = await svc.alerts(
        'c1',
        'u2',
        ability(role),
        alertFilters({ scope: 'all', summary: true }),
      );
      expect(summary).toEqual({ counts: result.counts });
      expect(todo.findMany.mock.calls[0][0].where.assigneeId).toBe('u2');
      expect(todo.count.mock.calls.every(([args]) => args.where.assigneeId === 'u2')).toBe(true);
    },
  );

  it('defaults to mine for editors and honours all; summary reads only counts', async () => {
    const { svc, todo, membership } = setup(mixed());
    expect(await svc.alerts('c1', 'u1', manager, alertFilters({ summary: true }))).toEqual({
      counts: { overdue: 0, dueSoon: 0, total: 0 },
    });
    expect(
      await svc.alerts('c1', 'u1', manager, alertFilters({ scope: 'all', summary: true })),
    ).toEqual({
      counts: { overdue: 1, dueSoon: 4, total: 5 },
    });
    expect(todo.count).toHaveBeenCalledTimes(4);
    expect(todo.findMany).not.toHaveBeenCalled();
    expect(membership.findMany).not.toHaveBeenCalled();
  });

  it.each([
    ['2026-10-01T01:00:00Z', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'],
    // Santiago advances from 23:59:59 to 01:00 at the spring DST transition.
    ['2026-09-06T03:59:59Z', '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07'],
    ['2026-09-06T04:00:00Z', '2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08'],
  ])(
    'uses civil dates across month/DST boundary %s',
    async (now, yesterday, today, tomorrow, after) => {
      jest.setSystemTime(new Date(now));
      const { svc } = setup([
        dated('late', yesterday),
        dated('today', today),
        dated('tomorrow', tomorrow),
        dated('after', after),
      ]);
      const result = await svc.alerts('c1', 'u2', viewer, alertFilters());
      expect(result.overdue?.map((row) => row.id)).toEqual(['late']);
      expect(result.dueSoon?.map((row) => row.id)).toEqual(['today', 'tomorrow']);
    },
  );

  it('completion removes the alert from both full and summary responses', async () => {
    const { svc } = setup([dated('own', '2026-09-15')]);
    await svc.complete('own', 'c1', 'u2', viewer);
    expect(await svc.alerts('c1', 'u2', viewer, alertFilters())).toEqual({
      counts: { overdue: 0, dueSoon: 0, total: 0 },
      overdue: [],
      dueSoon: [],
    });
    expect(await svc.alerts('c1', 'u2', viewer, alertFilters({ summary: true }))).toEqual({
      counts: { overdue: 0, dueSoon: 0, total: 0 },
    });
  });

  it('validates scope and summary without coercing false to true', async () => {
    for (const value of ['true', 'false']) {
      const dto = plainToInstance(FilterTodoAlertsDto, { summary: value });
      expect(await validate(dto)).toEqual([]);
      expect(dto).toMatchObject({ scope: 'mine', summary: value === 'true' });
    }
    expect(plainToInstance(FilterTodoAlertsDto, {})).toMatchObject({
      scope: 'mine',
      summary: false,
    });
    for (const invalid of [
      { scope: 'other' },
      { summary: '1' },
      { summary: '' },
      { summary: null },
    ])
      expect(
        (await validate(plainToInstance(FilterTodoAlertsDto, invalid))).length,
      ).toBeGreaterThan(0);
  });
});
