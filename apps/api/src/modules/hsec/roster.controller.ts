import { Controller, Get, UseGuards } from '@nestjs/common';
import { HsecIncidentSubject } from '../common/casl/casl-ability.factory';
import { CheckPolicies } from '../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../common/decorators/current-company.decorator';
import { PoliciesGuard } from '../common/guards/policies.guard';
import { JwtAuthGuard } from '../iam/guards/jwt-auth.guard';
import { RrhhEmployeeReadService } from '../rrhh/employee-read/employee-read.service';

/* HSEC-003 — the roster for HSEC pickers (PART1 §4): a thin HSEC-side surface over the
 * RrhhEmployeeRead leaf's listActiveLite. Gated `read HsecIncident` — reachable exactly by
 * the module's readers (MANAGER/ADMIN/SUPER_ADMIN per the uniform matrix); the floor makes
 * it 403 for ACCOUNTANT/ANALYST/VIEWER. Payload is the two-key signed contract
 * ({ employeeId, fullName }) — nothing to widen here without a new founder signature. */
@Controller('hsec')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class HsecRosterController {
  constructor(private readonly employeeRead: RrhhEmployeeReadService) {}

  @Get('roster')
  @CheckPolicies((ability) => ability.can('read', HsecIncidentSubject))
  roster(@CurrentCompany() companyId: string) {
    return this.employeeRead.listActiveLite(companyId);
  }
}
