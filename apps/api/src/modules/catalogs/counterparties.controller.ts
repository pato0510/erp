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
import { CounterpartiesService } from './counterparties.service';
import { CreateCounterpartyDto } from './dto/create-counterparty.dto';
import { UpdateCounterpartyDto } from './dto/update-counterparty.dto';
import { FilterCounterpartyDto } from './dto/filter-counterparty.dto';
import { JwtAuthGuard } from '../iam/guards/jwt-auth.guard';
import { PoliciesGuard } from '../common/guards/policies.guard';
import { CheckPolicies } from '../common/decorators/check-policies.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentCompany } from '../common/decorators/current-company.decorator';
import { CounterpartySubject } from '../common/casl/casl-ability.factory';

@Controller('counterparties')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class CounterpartiesController {
  constructor(private readonly counterpartiesService: CounterpartiesService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', CounterpartySubject))
  findAll(@CurrentCompany() companyId: string, @Query() filters: FilterCounterpartyDto) {
    return this.counterpartiesService.findAll(companyId, filters);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', CounterpartySubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.counterpartiesService.findOne(id, companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', CounterpartySubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateCounterpartyDto,
  ) {
    return this.counterpartiesService.create(companyId, user.id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', CounterpartySubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateCounterpartyDto,
  ) {
    return this.counterpartiesService.update(id, companyId, user.id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', CounterpartySubject))
  deactivate(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.counterpartiesService.deactivate(id, companyId, user.id);
  }
}
