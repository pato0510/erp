import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CategoryRulesService } from './category-rules.service';
import { CreateCategoryRuleDto } from './dto/create-category-rule.dto';
import { UpdateCategoryRuleDto } from './dto/update-category-rule.dto';
import { TestCategoryRuleDto } from './dto/test-category-rule.dto';
import { JwtAuthGuard } from '../iam/guards/jwt-auth.guard';
import { PoliciesGuard } from '../common/guards/policies.guard';
import { CheckPolicies } from '../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../common/decorators/current-company.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CategorySubject } from '../common/casl/casl-ability.factory';

@Controller('category-rules')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class CategoryRulesController {
  constructor(private readonly categoryRulesService: CategoryRulesService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', CategorySubject))
  findAll(@CurrentCompany() companyId: string) {
    // The management UI needs to see inactive rules so it can re-enable them.
    return this.categoryRulesService.getAllRules(companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', CategorySubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateCategoryRuleDto,
  ) {
    return this.categoryRulesService.createRule(companyId, user.id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', CategorySubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateCategoryRuleDto,
  ) {
    return this.categoryRulesService.updateRule(id, companyId, user.id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', CategorySubject))
  remove(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.categoryRulesService.deleteRule(id, companyId, user.id);
  }

  @Post('test')
  @CheckPolicies((ability) => ability.can('read', CategorySubject))
  test(@CurrentCompany() companyId: string, @Body() dto: TestCategoryRuleDto) {
    return this.categoryRulesService.testRule(
      companyId,
      dto.rut,
      dto.razonSocial,
      dto.movementType,
    );
  }
}
