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
import { AlertRuleSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { AlertRulePresetsService } from './alert-rule-presets.service';
import { AlertRulesService } from './alert-rules.service';
import { CreateAlertRuleDto } from './dto/create-alert-rule.dto';
import { FilterAlertRulesDto } from './dto/filter-alert-rules.dto';
import { UpdateAlertRuleDto } from './dto/update-alert-rule.dto';

@Controller('operations/alert-rules')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class AlertRulesController {
  constructor(
    private readonly service: AlertRulesService,
    private readonly presets: AlertRulePresetsService,
  ) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', AlertRuleSubject))
  findAll(@CurrentCompany() companyId: string, @Query() filters: FilterAlertRulesDto) {
    return this.service.findAll(companyId, filters);
  }

  /* `resolve/:documentTypeId` declared before `:id` so the literal segment
     wins. Returns the merged set of dynamic defaults + custom overrides
     for a single document type. */
  @Get('resolve/:documentTypeId')
  @CheckPolicies((ability) => ability.can('read', AlertRuleSubject))
  resolve(@Param('documentTypeId') documentTypeId: string, @CurrentCompany() companyId: string) {
    return this.service.resolveRulesForDocumentType(companyId, documentTypeId);
  }

  /* OPS-018 — bulk-applies the recommended Chilean rule pack. Idempotent
     (skips rules that already exist by name+documentTypeId). */
  @Post('apply-recommended-chile')
  @CheckPolicies((ability) => ability.can('create', AlertRuleSubject))
  applyRecommendedChile(@CurrentCompany() companyId: string, @CurrentUser() user: { id: string }) {
    return this.presets.applyRecommendedChileanRules(companyId, user.id);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', AlertRuleSubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', AlertRuleSubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateAlertRuleDto,
  ) {
    return this.service.create(companyId, user.id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', AlertRuleSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateAlertRuleDto,
  ) {
    return this.service.update(id, companyId, user.id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', AlertRuleSubject))
  remove(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.remove(id, companyId, user.id);
  }
}
