import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Todo, TodoStatus } from '@prisma/client';
import { AppAbility, TodoSubject } from '../../common/casl/casl-ability.factory';
import { RlsService } from '../../common/rls/rls.service';
import { NotificationService } from '../../operations/notifications/notification.service';
import { CreateTodoDto, FilterTodoAlertsDto, FilterTodosDto, UpdateTodoDto } from './dto/todo.dto';
import { OPEN_TODO_STATUSES } from './todo-status';

const NAME_SELECT = { id: true, firstName: true, lastName: true, email: true } as const;
const SANTIAGO_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Santiago',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const STATUS_CONFLICT = 'El to-do cambió mientras lo editabas; recarga e inténtalo de nuevo.';

@Injectable()
export class TodosService {
  constructor(
    private readonly rls: RlsService,
    private readonly notifications: NotificationService,
  ) {}

  // GO-001 amendment: IAM infra lookup, never the administrative /users endpoint.
  // Historical row names can resolve inactive memberships; the picker is active-only.
  private members(tx: Prisma.TransactionClient, companyId: string, ids?: string[]) {
    return tx.membership.findMany({
      where: { companyId, ...(ids ? { userId: { in: ids } } : { isActive: true }) },
      select: { user: { select: NAME_SELECT } },
      orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
    });
  }

  assignees(companyId: string, userId: string) {
    return this.rls.executeWithRls(companyId, userId, async (tx) =>
      (await this.members(tx, companyId)).map(({ user }) => user),
    );
  }

  findAll(companyId: string, userId: string, ability: AppAbility, filters: FilterTodosDto) {
    return this.rls.executeWithRls(companyId, userId, async (tx) => {
      const where = this.scopeWhere(companyId, userId, ability, filters.scope);
      if (!where.assigneeId && filters.assigneeId) where.assigneeId = filters.assigneeId;
      const status = filters.status ?? 'OPEN';
      if (status !== 'ALL') where.status = status === 'OPEN' ? { in: OPEN_TODO_STATUSES } : status;
      if (filters.dueBefore) where.dueDate = { lt: this.dateOnly(filters.dueBefore) };
      if (filters.completedAfter)
        where.OR = [
          { status: { in: OPEN_TODO_STATUSES } },
          { status: 'DONE', completedAt: { gte: this.startOfSantiagoDay(filters.completedAfter) } },
        ];
      const rows = await tx.todo.findMany({
        where,
        orderBy: [
          // PostgreSQL enum order follows the board columns; DONE remains last.
          { status: 'asc' },
          { dueDate: { sort: 'asc', nulls: 'last' } },
          { createdAt: 'desc' },
        ],
      });
      return this.resolveRows(tx, companyId, userId, ability, rows, this.todayInSantiago());
    });
  }

  // ALERT-002 — list and live alerts share scope, Chilean date and one batched name lookup.
  private scopeWhere(
    companyId: string,
    userId: string,
    ability: AppAbility,
    scope: 'mine' | 'all',
  ): Prisma.TodoWhereInput {
    return {
      companyId,
      ...(!ability.can('update', TodoSubject) || scope !== 'all' ? { assigneeId: userId } : {}),
    };
  }

  private todayInSantiago(): string {
    return SANTIAGO_DATE.format(new Date());
  }

  private startOfSantiagoDay(value: string): Date {
    const utc = this.dateOnly(value, 'completedAfter no es una fecha válida.').getTime();
    // completedAt is an instant, unlike @db.Date dueDate. Find the first instant
    // of the civil day, including Santiago's skipped/repeated midnight at DST.
    let low = utc - 86_400_000;
    let high = utc + 86_400_000;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (SANTIAGO_DATE.format(new Date(middle)) < value) low = middle + 1;
      else high = middle;
    }
    return new Date(low);
  }

  private async resolveRows(
    tx: Prisma.TransactionClient,
    companyId: string,
    userId: string,
    ability: AppAbility,
    rows: Todo[],
    today: string,
  ) {
    const ids = [...new Set(rows.flatMap((row) => [row.assigneeId, row.createdBy]))];
    const members = await this.members(tx, companyId, ids);
    const names = new Map(members.map(({ user }) => [user.id, user]));
    return rows.map((row) => {
      const assignee = names.get(row.assigneeId);
      const creator = names.get(row.createdBy);
      return {
        ...row,
        assignee: assignee
          ? { id: assignee.id, firstName: assignee.firstName, lastName: assignee.lastName }
          : null,
        createdByName: creator ? `${creator.firstName} ${creator.lastName}`.trim() : null,
        overdue:
          OPEN_TODO_STATUSES.includes(row.status) &&
          row.dueDate !== null &&
          row.dueDate.toISOString().slice(0, 10) < today,
        canComplete:
          OPEN_TODO_STATUSES.includes(row.status) && this.canComplete(row, userId, ability),
        canChangeStatus: OPEN_TODO_STATUSES.includes(row.status)
          ? this.canComplete(row, userId, ability)
          : ability.can('update', TodoSubject),
        // Row ownership is computed from CASL, so ADMIN can delete others' rows without FE roles.
        canDelete:
          ability.can('delete', TodoSubject) &&
          (row.createdBy === userId || ability.can('manage', TodoSubject)),
      };
    });
  }

  alerts(companyId: string, userId: string, ability: AppAbility, filters: FilterTodoAlertsDto) {
    return this.rls.executeWithRls(companyId, userId, async (tx) => {
      const today = this.todayInSantiago();
      const start = this.dateOnly(today);
      // Civil dates stored at UTC midnight: advance the date, independent of Santiago DST.
      const tomorrow = new Date(start);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      const where: Prisma.TodoWhereInput = {
        ...this.scopeWhere(companyId, userId, ability, filters.scope),
        status: { in: OPEN_TODO_STATUSES },
      };
      if (filters.summary) {
        const [overdue, dueSoon] = await Promise.all([
          tx.todo.count({ where: { ...where, dueDate: { lt: start } } }),
          tx.todo.count({ where: { ...where, dueDate: { gte: start, lte: tomorrow } } }),
        ]);
        return { counts: { overdue, dueSoon, total: overdue + dueSoon } };
      }
      const rows = await tx.todo.findMany({
        where: { ...where, dueDate: { lte: tomorrow } },
        // TodoPriority is declared LOW, MEDIUM, HIGH; DESC puts HIGH first.
        orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }, { id: 'asc' }],
      });
      const resolved = await this.resolveRows(tx, companyId, userId, ability, rows, today);
      const overdue = resolved.filter((row) => row.overdue);
      const dueSoon = resolved.filter((row) => !row.overdue);
      return {
        counts: { overdue: overdue.length, dueSoon: dueSoon.length, total: resolved.length },
        overdue,
        dueSoon,
      };
    });
  }

  private async memberOrThrow(tx: Prisma.TransactionClient, companyId: string, assigneeId: string) {
    const member = await tx.membership.findFirst({
      where: { companyId, userId: assigneeId, isActive: true },
      select: { id: true },
    });
    if (!member)
      throw new BadRequestException('El usuario asignado no pertenece a la organización.');
  }

  private async getOrThrow(tx: Prisma.TransactionClient, companyId: string, id: string) {
    const row = await tx.todo.findFirst({ where: { id, companyId } });
    if (!row) throw new NotFoundException('To-do no encontrado.');
    return row;
  }

  private dateOnly(value: string, message = 'La fecha límite no es válida.'): Date {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    ) {
      throw new BadRequestException(message);
    }
    return date;
  }

  private fields(dto: UpdateTodoDto) {
    const data: Prisma.TodoUpdateManyMutationInput = {};
    if (dto.title !== undefined) {
      const title = dto.title?.trim();
      if (!title || title.length > 200)
        throw new BadRequestException('El título debe tener entre 1 y 200 caracteres.');
      data.title = title;
    }
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.dueDate !== undefined)
      data.dueDate = dto.dueDate === null ? null : this.dateOnly(dto.dueDate);
    if (dto.assigneeId !== undefined) data.assigneeId = dto.assigneeId;
    return data;
  }

  private notify(companyId: string, actorId: string, row: Todo) {
    if (row.assigneeId === actorId) return;
    // Same request, after commit: mirrors HSEC's best-effort createGeneric path.
    // createGeneric opens recipient-scoped RLS; no cron, queue or email.
    return this.notifications.createGeneric(companyId, {
      userIds: [row.assigneeId],
      sourceType: 'GENERAL',
      severity: 'INFO',
      title: 'Nuevo to-do asignado',
      message: row.title,
      linkPath: '/actividades/todos',
      icon: 'CheckCheck',
    });
  }

  async create(companyId: string, userId: string, dto: CreateTodoDto) {
    const fields = this.fields(dto);
    const row = await this.rls.executeWithRls(companyId, userId, async (tx) => {
      await this.memberOrThrow(tx, companyId, dto.assigneeId);
      return tx.todo.create({
        data: {
          companyId,
          createdBy: userId,
          title: fields.title as string,
          description: dto.description?.trim() || null,
          priority: dto.priority ?? 'MEDIUM',
          dueDate: dto.dueDate ? this.dateOnly(dto.dueDate) : null,
          assigneeId: dto.assigneeId,
        },
      });
    });
    await this.notify(companyId, userId, row);
    return row;
  }

  async update(id: string, companyId: string, userId: string, dto: UpdateTodoDto) {
    const data = this.fields(dto);
    const result = await this.rls.executeWithRls(companyId, userId, async (tx) => {
      const row = await this.getOrThrow(tx, companyId, id);
      if (!OPEN_TODO_STATUSES.includes(row.status))
        throw new BadRequestException('Reabre el to-do antes de editarlo.');
      const reassigned = dto.assigneeId !== undefined && dto.assigneeId !== row.assigneeId;
      if (reassigned) await this.memberOrThrow(tx, companyId, dto.assigneeId as string);
      // Compare-and-set prevents an edit from racing a completion or another edit.
      const changed = await tx.todo.updateMany({
        where: { id, companyId, status: { in: OPEN_TODO_STATUSES }, updatedAt: row.updatedAt },
        data,
      });
      if (!changed.count)
        throw new ConflictException('El to-do cambió. Actualiza la lista e inténtalo de nuevo.');
      return { row: await this.getOrThrow(tx, companyId, id), reassigned };
    });
    if (result.reassigned) await this.notify(companyId, userId, result.row);
    return result.row;
  }

  private canComplete(row: Todo, userId: string, ability: AppAbility): boolean {
    return row.assigneeId === userId || ability.can('update', TodoSubject);
  }

  private assertCanComplete(row: Todo, userId: string, ability: AppAbility) {
    if (!this.canComplete(row, userId, ability))
      throw new ForbiddenException('Solo el responsable o un editor puede completar este to-do.');
  }

  complete(id: string, companyId: string, userId: string, ability: AppAbility) {
    return this.transition(id, companyId, userId, ability, 'DONE');
  }

  async reopen(id: string, companyId: string, userId: string, ability: AppAbility) {
    if (!ability.can('update', TodoSubject))
      throw new ForbiddenException('No tienes permiso para reabrir to-dos.');
    return this.transition(id, companyId, userId, ability, 'PENDING', true);
  }

  changeStatus(
    id: string,
    companyId: string,
    userId: string,
    ability: AppAbility,
    status: TodoStatus,
  ) {
    return this.transition(id, companyId, userId, ability, status);
  }

  private transition(
    id: string,
    companyId: string,
    userId: string,
    ability: AppAbility,
    status: TodoStatus,
    reopenOnly = false,
  ) {
    return this.rls.executeWithRls(companyId, userId, async (tx) => {
      const row = await this.getOrThrow(tx, companyId, id);
      if (row.status === 'DONE' && status !== 'DONE') {
        if (!ability.can('update', TodoSubject))
          throw new ForbiddenException('No tienes permiso para reabrir to-dos.');
      } else this.assertCanComplete(row, userId, ability);
      // Authorize even no-ops; /reopen never resets work that is already open.
      if (row.status === status || (reopenOnly && OPEN_TODO_STATUSES.includes(row.status)))
        return row;
      const changed = await tx.todo.updateMany({
        where: {
          id,
          companyId,
          status: row.status,
          assigneeId: row.assigneeId,
          updatedAt: row.updatedAt,
        },
        data: {
          status,
          completedAt: status === 'DONE' ? new Date() : null,
          completedBy: status === 'DONE' ? userId : null,
        },
      });
      if (!changed.count) throw new ConflictException(STATUS_CONFLICT);
      return this.getOrThrow(tx, companyId, id);
    });
  }

  remove(id: string, companyId: string, userId: string, ability: AppAbility) {
    return this.rls.executeWithRls(companyId, userId, async (tx) => {
      const row = await this.getOrThrow(tx, companyId, id);
      if (
        !ability.can('delete', TodoSubject) ||
        (row.createdBy !== userId && !ability.can('manage', TodoSubject))
      )
        throw new ForbiddenException(
          'Solo el creador o un administrador puede eliminar este to-do.',
        );
      // GO-001: hard delete is intentional for to-dos; audit_todos retains the old row.
      await tx.todo.delete({ where: { id, companyId } });
      return { deleted: true };
    });
  }
}
