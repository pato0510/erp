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
import { PermitApprovalStepSubject } from '../../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../../iam/guards/jwt-auth.guard';
import { CreateApprovalStepDto } from './dto/create-approval-step.dto';
import { ApplyDefaultsDto, ReorderStepsDto } from './dto/reorder-steps.dto';
import { UpdateApprovalStepDto } from './dto/update-approval-step.dto';
import { ApprovalStepsService, PermitTypeKind } from './approval-steps.service';

@Controller('operations/approval-steps')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class ApprovalStepsController {
  constructor(private readonly service: ApprovalStepsService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', PermitApprovalStepSubject))
  findAll(
    @CurrentCompany() companyId: string,
    @Query('permitType') permitType?: string,
    @Query('permitTypeId') permitTypeId?: string,
  ) {
    if (permitType && permitTypeId) {
      if (permitType !== 'work-permit' && permitType !== 'external-permit') {
        throw new BadRequestException('permitType debe ser work-permit o external-permit.');
      }
      return this.service.findStepsForPermitType(
        companyId,
        permitType as PermitTypeKind,
        permitTypeId,
      );
    }
    return this.service.findAll(companyId);
  }

  /* Literal segments declared before `:id` so the route matcher
     doesn't try to parse them as a UUID param. */
  @Post('apply-defaults')
  @CheckPolicies((ability) => ability.can('create', PermitApprovalStepSubject))
  applyDefaults(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: ApplyDefaultsDto,
  ) {
    return this.service.applyDefaults(companyId, user.id, dto);
  }

  @Post('reorder')
  @CheckPolicies((ability) => ability.can('update', PermitApprovalStepSubject))
  reorder(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: ReorderStepsDto,
  ) {
    return this.service.reorder(companyId, user.id, dto);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', PermitApprovalStepSubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', PermitApprovalStepSubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateApprovalStepDto,
  ) {
    return this.service.create(companyId, user.id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', PermitApprovalStepSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateApprovalStepDto,
  ) {
    return this.service.update(id, companyId, user.id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', PermitApprovalStepSubject))
  remove(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.remove(id, companyId, user.id);
  }
}
