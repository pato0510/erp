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
import { HsecIncidentSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { ChangeIncidentStatusDto } from './dto/change-incident-status.dto';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { UpdateIncidentDto } from './dto/update-incident.dto';
import { IncidentsService } from './incidents.service';

/* HSEC-002 — incident CRUD + status machine. EVERY endpoint declares @CheckPolicies on
 * HsecIncidentSubject (PoliciesGuard fails OPEN). The founder-signed matrix (PART1 decision
 * 3) is uniform: MANAGER full CRUD, ADMIN/SUPER_ADMIN via `manage all`,
 * ACCOUNTANT/ANALYST/VIEWER floored (403 on every endpoint here, read included). Writes run
 * through executeWithRls; createdBy is the JWT actor (a spoofed DTO createdBy is never read);
 * status on create is forced REPORTADO in the service. */
@Controller('hsec/incidents')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class IncidentsController {
  constructor(private readonly service: IncidentsService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', HsecIncidentSubject))
  findAll(@CurrentCompany() companyId: string, @Query('status') status?: string) {
    return this.service.findAll(companyId, status);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', HsecIncidentSubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', HsecIncidentSubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateIncidentDto,
  ) {
    return this.service.create(companyId, user.id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', HsecIncidentSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateIncidentDto,
  ) {
    return this.service.update(id, companyId, user.id, dto);
  }

  @Patch(':id/status')
  @CheckPolicies((ability) => ability.can('update', HsecIncidentSubject))
  changeStatus(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: ChangeIncidentStatusDto,
  ) {
    return this.service.changeStatus(id, companyId, user.id, dto.status);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', HsecIncidentSubject))
  remove(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.remove(id, companyId, user.id);
  }
}
