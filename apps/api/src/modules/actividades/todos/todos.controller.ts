import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AppAbility, TodoSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentAbility } from '../../common/decorators/current-ability.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import {
  ChangeTodoStatusDto,
  CreateTodoDto,
  FilterTodoAlertsDto,
  FilterTodosDto,
  UpdateTodoDto,
} from './dto/todo.dto';
import { TodosService } from './todos.service';

// GO-001 — every route declares a policy, including the assignee's complete action.
@Controller('todos')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class TodosController {
  constructor(private readonly service: TodosService) {}

  @Get('assignees')
  @CheckPolicies((ability) => ability.can('create', TodoSubject))
  assignees(@CurrentCompany() companyId: string, @CurrentUser() user: { id: string }) {
    return this.service.assignees(companyId, user.id);
  }

  @Get('alerts')
  @CheckPolicies((ability) => ability.can('read', TodoSubject))
  alerts(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @CurrentAbility() ability: AppAbility,
    @Query() filters: FilterTodoAlertsDto,
  ) {
    return this.service.alerts(companyId, user.id, ability, filters);
  }

  @Get()
  @CheckPolicies((ability) => ability.can('read', TodoSubject))
  findAll(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @CurrentAbility() ability: AppAbility,
    @Query() filters: FilterTodosDto,
  ) {
    return this.service.findAll(companyId, user.id, ability, filters);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', TodoSubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateTodoDto,
  ) {
    return this.service.create(companyId, user.id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', TodoSubject))
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateTodoDto,
  ) {
    return this.service.update(id, companyId, user.id, dto);
  }

  @Patch(':id/status')
  @CheckPolicies((ability) => ability.can('read', TodoSubject))
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @CurrentAbility() ability: AppAbility,
    @Body() dto: ChangeTodoStatusDto,
  ) {
    return this.service.changeStatus(id, companyId, user.id, ability, dto.status);
  }

  @Patch(':id/complete')
  @CheckPolicies((ability) => ability.can('read', TodoSubject))
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @CurrentAbility() ability: AppAbility,
  ) {
    return this.service.complete(id, companyId, user.id, ability);
  }

  @Patch(':id/reopen')
  @CheckPolicies((ability) => ability.can('update', TodoSubject))
  reopen(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @CurrentAbility() ability: AppAbility,
  ) {
    return this.service.reopen(id, companyId, user.id, ability);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', TodoSubject))
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @CurrentAbility() ability: AppAbility,
  ) {
    return this.service.remove(id, companyId, user.id, ability);
  }
}
