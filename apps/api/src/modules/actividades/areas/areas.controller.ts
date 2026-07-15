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
import { ActivityAreaSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { AreasService } from './areas.service';
import { CreateAreaDto } from './dto/create-area.dto';
import { UpdateAreaDto } from './dto/update-area.dto';

/* CAL-002 — activity-area catalog CRUD. EVERY endpoint declares @CheckPolicies on
 * ActivityAreaSubject (PoliciesGuard fails OPEN). READ: ALL SIX roles (the inverted cell —
 * even VIEWER sees this config screen; no money here). WRITE (create/update/delete):
 * MANAGER/ADMIN/SUPER_ADMIN only. Writes run through executeWithRls; createdBy is the JWT
 * actor. */
@Controller('actividades/areas')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class AreasController {
  constructor(private readonly service: AreasService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', ActivityAreaSubject))
  findAll(@CurrentCompany() companyId: string, @Query('active') active?: string) {
    const filter = active === undefined ? undefined : active === 'true';
    return this.service.findAll(companyId, { active: filter });
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', ActivityAreaSubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateAreaDto,
  ) {
    return this.service.create(companyId, user.id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', ActivityAreaSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateAreaDto,
  ) {
    return this.service.update(id, companyId, user.id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', ActivityAreaSubject))
  remove(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.remove(id, companyId, user.id);
  }
}
