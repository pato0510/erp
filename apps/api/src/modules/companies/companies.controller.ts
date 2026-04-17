import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { JwtAuthGuard } from '../iam/guards/jwt-auth.guard';
import { PoliciesGuard } from '../common/guards/policies.guard';
import { CheckPolicies } from '../common/decorators/check-policies.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CompanySubject } from '../common/casl/casl-ability.factory';

@Controller('companies')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', CompanySubject))
  getCompany(@Param('id') id: string) {
    return this.companiesService.getCompanyById(id);
  }

  @Get(':id/settings')
  @CheckPolicies((ability) => ability.can('read', CompanySubject))
  getSettings(@Param('id') id: string) {
    return this.companiesService.getSettings(id);
  }

  @Patch(':id/settings')
  @CheckPolicies((ability) => ability.can('update', CompanySubject))
  updateSettings(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateSettingsDto,
  ) {
    return this.companiesService.updateSettings(id, user.id, dto);
  }
}
