import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AvailabilitySubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { DisponibilidadService } from './disponibilidad.service';

/* HR-015 — tablero de disponibilidad. READ-ONLY; every endpoint declares
 * @CheckPolicies on AvailabilitySubject (in RRHH_SUBJECTS, read⟺manage). In the
 * current RBAC only MANAGER/ADMIN/SUPER_ADMIN can read RRHH subjects — ACCOUNTANT
 * (compensation-only), ANALYST (no RRHH read) and VIEWER all get 403. The board
 * carries NO salary/compensation/settlement/finiquito data. */
@Controller('rrhh/disponibilidad')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class DisponibilidadController {
  constructor(private readonly service: DisponibilidadService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', AvailabilitySubject))
  getAvailability(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Query('date') date?: string,
  ) {
    return this.service.getAvailability(companyId, user.id, date);
  }

  @Get('matriz')
  @CheckPolicies((ability) => ability.can('read', AvailabilitySubject))
  getMatriz(@CurrentCompany() companyId: string, @CurrentUser() user: { id: string }) {
    return this.service.getMatriz(companyId, user.id);
  }

  @Get('alertas')
  @CheckPolicies((ability) => ability.can('read', AvailabilitySubject))
  getAlertas(@CurrentCompany() companyId: string, @CurrentUser() user: { id: string }) {
    return this.service.getAlertas(companyId, user.id);
  }
}
