import {
  BadRequestException,
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
import { ActivitySubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { ActivitiesService } from './activities.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';

/* COM-008 — activities CRUD (the CRM interaction timeline). EVERY endpoint declares
 * @CheckPolicies on ActivitySubject (PoliciesGuard fails OPEN). READ:
 * MANAGER/ADMIN/SUPER_ADMIN + ACCOUNTANT; WRITE (create/update/delete):
 * MANAGER/ADMIN/SUPER_ADMIN. The list is scoped either by account (its whole history,
 * incl. its opportunities' activities) or by opportunity (only its own) — exactly one
 * of accountId/opportunityId is required. Writes run through executeWithRls. */
@Controller('comercial/activities')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class ActivitiesController {
  constructor(private readonly service: ActivitiesService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', ActivitySubject))
  findAll(
    @CurrentCompany() companyId: string,
    @Query('accountId') accountId?: string,
    @Query('opportunityId') opportunityId?: string,
    @Query('limit') limit?: string,
  ) {
    const take = limit ? Number(limit) : undefined;
    if (opportunityId) return this.service.findAllByOpportunity(companyId, opportunityId, take);
    if (accountId) return this.service.findAllByAccount(companyId, accountId, take);
    throw new BadRequestException('Debes indicar accountId u opportunityId.');
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', ActivitySubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateActivityDto,
  ) {
    return this.service.create(companyId, user.id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', ActivitySubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateActivityDto,
  ) {
    return this.service.update(companyId, user.id, id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', ActivitySubject))
  remove(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.remove(companyId, user.id, id);
  }
}
