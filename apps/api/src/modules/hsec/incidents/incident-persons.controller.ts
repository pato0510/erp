import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { HsecIncidentPersonSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { CreateIncidentPersonDto } from './dto/create-incident-person.dto';
import { UpdateIncidentPersonDto } from './dto/update-incident-person.dto';
import { IncidentPersonsService } from './incident-persons.service';

/* HSEC-003 — afectados nested under an incident. EVERY endpoint declares @CheckPolicies on
 * HsecIncidentPersonSubject (PoliciesGuard fails OPEN). Same uniform founder-signed matrix:
 * MANAGER full CRUD, ADMIN/SUPER_ADMIN via `manage all`, everyone else floored. Writes via
 * executeWithRls; incident-belongs-to-company is enforced in the service (404). */
@Controller('hsec/incidents/:id/persons')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class IncidentPersonsController {
  constructor(private readonly service: IncidentPersonsService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', HsecIncidentPersonSubject))
  list(@Param('id') incidentId: string, @CurrentCompany() companyId: string) {
    return this.service.list(incidentId, companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', HsecIncidentPersonSubject))
  create(
    @Param('id') incidentId: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateIncidentPersonDto,
  ) {
    return this.service.create(incidentId, companyId, user.id, dto);
  }

  @Patch(':personId')
  @CheckPolicies((ability) => ability.can('update', HsecIncidentPersonSubject))
  update(
    @Param('id') incidentId: string,
    @Param('personId') personId: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateIncidentPersonDto,
  ) {
    return this.service.update(incidentId, personId, companyId, user.id, dto);
  }

  @Delete(':personId')
  @CheckPolicies((ability) => ability.can('delete', HsecIncidentPersonSubject))
  remove(
    @Param('id') incidentId: string,
    @Param('personId') personId: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.remove(incidentId, personId, companyId, user.id);
  }
}
