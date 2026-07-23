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
import { CreateNoteDto } from './dto/create-note.dto';
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
    @Query('kind') kind?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.findAll(companyId, { status, areaId, assigneeId, kind, from, to });
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

  /* CAL-009 / CAL-012 — the bitácora. GET is `read CalendarActivity` (all six roles); POST/PATCH/
     DELETE are `update CalendarActivity` (writers only) — notes are part of the activity, NO new
     CASL subject. CAL-009 shipped this append-only (immutable); the founder REVERSED that on
     2026-07-22 (CAL-012): writers may edit/delete any entry. authorId on append is the JWT actor,
     never the DTO. The audit trigger keeps the prior content of every UPDATE/DELETE. */
  @Get(':id/notes')
  @CheckPolicies((ability) => ability.can('read', CalendarActivitySubject))
  listNotes(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.service.listNotes(id, companyId);
  }

  @Post(':id/notes')
  @CheckPolicies((ability) => ability.can('update', CalendarActivitySubject))
  addNote(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateNoteDto,
  ) {
    return this.service.addNote(id, companyId, user.id, dto.text);
  }

  /* CAL-012 — edit an entry (writers). Reuses CreateNoteDto ({ text }); the non-empty rule +
     ownership check live in the service. Sets updatedAt. */
  @Patch(':id/notes/:noteId')
  @CheckPolicies((ability) => ability.can('update', CalendarActivitySubject))
  editNote(
    @Param('id') id: string,
    @Param('noteId') noteId: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateNoteDto,
  ) {
    return this.service.editNote(id, noteId, companyId, user.id, dto.text);
  }

  /* CAL-012 — hard-delete an entry (writers). The audit trigger preserves the content. */
  @Delete(':id/notes/:noteId')
  @CheckPolicies((ability) => ability.can('update', CalendarActivitySubject))
  deleteNote(
    @Param('id') id: string,
    @Param('noteId') noteId: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.deleteNote(id, noteId, companyId, user.id);
  }
}
