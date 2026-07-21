import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ActivityStatus } from '@prisma/client';
import { CalendarActivitySubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { ActivitiesService } from './activities.service';
import { ChangeStatusDto } from './dto/change-status.dto';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';

/* CAL-003 — calendar-activity CRUD + status machine. EVERY endpoint declares @CheckPolicies on
 * CalendarActivitySubject (PoliciesGuard fails OPEN). READ (list/detail): ALL SIX roles (the
 * inverted cell — no money on this surface). WRITE (create/update/status/delete):
 * MANAGER/ADMIN/SUPER_ADMIN only. Writes run through executeWithRls; createdBy is the JWT
 * actor; status on create is forced PENDIENTE in the service (never read from the DTO). The
 * month FEED lives on the root ActividadesController (GET /actividades/calendar). */
@Controller('actividades/activities')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class ActivitiesController {
  constructor(private readonly service: ActivitiesService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', CalendarActivitySubject))
  findAll(
    @CurrentCompany() companyId: string,
    @Query('status') status?: ActivityStatus,
    @Query('areaId') areaId?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.findAll(companyId, { status, areaId, assigneeId, from, to });
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', CalendarActivitySubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', CalendarActivitySubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateActivityDto,
  ) {
    return this.service.create(companyId, user.id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', CalendarActivitySubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateActivityDto,
  ) {
    return this.service.update(id, companyId, user.id, dto);
  }

  @Patch(':id/status')
  @CheckPolicies((ability) => ability.can('update', CalendarActivitySubject))
  changeStatus(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: ChangeStatusDto,
  ) {
    return this.service.changeStatus(id, companyId, user.id, dto.status);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', CalendarActivitySubject))
  remove(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.remove(id, companyId, user.id);
  }
}
