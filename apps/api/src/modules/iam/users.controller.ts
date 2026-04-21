import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PoliciesGuard } from '../common/guards/policies.guard';
import { CheckPolicies } from '../common/decorators/check-policies.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentCompany } from '../common/decorators/current-company.decorator';
import { UserSubject } from '../common/casl/casl-ability.factory';

// Only SUPER_ADMIN and ADMIN have `manage` in the ability factory (via `manage all`).
// Other roles — MANAGER/ACCOUNTANT/ANALYST/VIEWER — will 403 on every endpoint here.
@Controller('users')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('manage', UserSubject))
  findAll(@CurrentCompany() companyId: string) {
    return this.usersService.findAll(companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('manage', UserSubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() actor: { id: string },
    @Body() dto: CreateUserDto,
  ) {
    return this.usersService.create(companyId, actor.id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('manage', UserSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() actor: { id: string },
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(id, companyId, actor.id, dto);
  }
}
