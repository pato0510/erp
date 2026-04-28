import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { AlertSettingsSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { CompanyAlertSettingsService } from './company-alert-settings.service';
import { UpdateAlertSettingsDto } from './dto/update-alert-settings.dto';

/* OPS-018 — singleton settings endpoint. GET auto-creates the row with
   defaults if missing so the frontend never has to special-case the
   "first visit" flow. */
@Controller('operations/alert-settings')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class CompanyAlertSettingsController {
  constructor(private readonly service: CompanyAlertSettingsService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', AlertSettingsSubject))
  get(@CurrentCompany() companyId: string, @CurrentUser() user: { id: string }) {
    return this.service.getOrCreate(companyId, user.id);
  }

  @Patch()
  @CheckPolicies((ability) => ability.can('update', AlertSettingsSubject))
  update(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateAlertSettingsDto,
  ) {
    return this.service.update(companyId, user.id, dto);
  }
}
