import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Todo } from '@prisma/client';
import { AppAbility, TodoSubject } from '../../common/casl/casl-ability.factory';
import { RlsService } from '../../common/rls/rls.service';
import { NotificationService } from '../../operations/notifications/notification.service';
import { CreateTodoDto, FilterTodoAlertsDto, FilterTodosDto, UpdateTodoDto } from './dto/todo.dto';

const NAME_SELECT = { id: true, firstName: true, lastName: true, email: true } as const;

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
      if (filters.status !== 'ALL') where.status = filters.status ?? 'PENDING';
      if (filters.dueBefore) where.dueDate = { lt: this.dateOnly(filters.dueBefore) };
      const rows = await tx.todo.findMany({
        where,
        orderBy: [
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
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Santiago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
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
          row.status === 'PENDING' &&
          row.dueDate !== null &&
          row.dueDate.toISOString().slice(0, 10) < today,
        canComplete: row.status === 'PENDING' && this.canComplete(row, userId, ability),
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
        status: 'PENDING',
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

  private dateOnly(value: string): Date {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    ) {
      throw new BadRequestException('La fecha límite no es válida.');
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
      if (row.status === 'DONE')
        throw new BadRequestException('Reabre el to-do antes de editarlo.');
      const reassigned = dto.assigneeId !== undefined && dto.assigneeId !== row.assigneeId;
      if (reassigned) await this.memberOrThrow(tx, companyId, dto.assigneeId as string);
      // Compare-and-set prevents an edit from racing a completion or another edit.
      const changed = await tx.todo.updateMany({
        where: { id, companyId, status: 'PENDING', updatedAt: row.updatedAt },
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
    return this.rls.executeWithRls(companyId, userId, async (tx) => {
      const row = await this.getOrThrow(tx, companyId, id);
      this.assertCanComplete(row, userId, ability);
      if (row.status === 'DONE') return row;
      const changed = await tx.todo.updateMany({
        where: {
          id,
          companyId,
          status: 'PENDING',
          assigneeId: row.assigneeId,
          updatedAt: row.updatedAt,
        },
        data: { status: 'DONE', completedAt: new Date(), completedBy: userId },
      });
      const fresh = await this.getOrThrow(tx, companyId, id);
      this.assertCanComplete(fresh, userId, ability);
      if (!changed.count && fresh.status !== 'DONE')
        throw new ConflictException('El to-do cambió. Actualiza la lista e inténtalo de nuevo.');
      return fresh;
    });
  }

  async reopen(id: string, companyId: string, userId: string, ability: AppAbility) {
    if (!ability.can('update', TodoSubject))
      throw new ForbiddenException('No tienes permiso para reabrir to-dos.');
    return this.rls.executeWithRls(companyId, userId, async (tx) => {
      const row = await this.getOrThrow(tx, companyId, id);
      if (row.status === 'PENDING') return row;
      const changed = await tx.todo.updateMany({
        where: { id, companyId, status: 'DONE', updatedAt: row.updatedAt },
        data: { status: 'PENDING', completedAt: null, completedBy: null },
      });
      if (!changed.count)
        throw new ConflictException('El to-do cambió. Actualiza la lista e inténtalo de nuevo.');
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
