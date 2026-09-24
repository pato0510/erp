import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { LeadSubject, OpportunitySubject } from '../../common/casl/casl-ability.factory';
import type { AppAbility } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentAbility } from '../../common/decorators/current-ability.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { CreateLeadDto } from './dto/create-lead.dto';
import { LeadsQueryDto } from './dto/leads-query.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { LeadsService } from './leads.service';

const leadIdPipe = new ParseUUIDPipe({
  exceptionFactory: () => new BadRequestException('El id del lead debe ser un UUID válido.'),
});

// Every route has a policy: PoliciesGuard fails open without one.
@Controller('comercial/leads')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class LeadsController {
  constructor(private readonly service: LeadsService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', LeadSubject))
  findAll(@CurrentCompany() companyId: string, @Query() query: LeadsQueryDto) {
    return this.service.findAll(companyId, query);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', LeadSubject))
  findOne(@Param('id', leadIdPipe) id: string, @CurrentCompany() companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', LeadSubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateLeadDto,
    @CurrentAbility() ability: AppAbility,
  ) {
    if (dto.opportunityId && !ability.can('update', OpportunitySubject)) {
      throw new ForbiddenException('No tienes permiso para vincular leads a oportunidades.');
    }
    return this.service.create(companyId, user.id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', LeadSubject))
  update(
    @Param('id', leadIdPipe) id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateLeadDto,
  ) {
    return this.service.update(id, companyId, user.id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', LeadSubject))
  remove(
    @Param('id', leadIdPipe) id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.remove(id, companyId, user.id);
  }
}
