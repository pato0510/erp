import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { BankingService } from './banking.service';
import { CreateConnectionDto } from './dto/create-connection.dto';
import { JwtAuthGuard } from '../iam/guards/jwt-auth.guard';
import { PoliciesGuard } from '../common/guards/policies.guard';
import { CheckPolicies } from '../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../common/decorators/current-company.decorator';
import { MovementSubject } from '../common/casl/casl-ability.factory';
import { Transform } from 'class-transformer';

@Controller('banking')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class BankingController {
  constructor(private readonly bankingService: BankingService) {}

  @Post('connections')
  @CheckPolicies((ability) => ability.can('create', MovementSubject))
  createConnection(@CurrentCompany() companyId: string, @Body() dto: CreateConnectionDto) {
    return this.bankingService.createConnection(companyId, dto);
  }

  @Get('connections')
  @CheckPolicies((ability) => ability.can('read', MovementSubject))
  getConnections(@CurrentCompany() companyId: string) {
    return this.bankingService.getConnections(companyId);
  }

  @Get('connections/:id')
  @CheckPolicies((ability) => ability.can('read', MovementSubject))
  getConnection(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.bankingService.getConnection(id, companyId);
  }

  @Post('connections/:id/sync-balance')
  @CheckPolicies((ability) => ability.can('update', MovementSubject))
  syncBalance(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.bankingService.syncBalance(id, companyId);
  }

  @Post('connections/:id/sync-movements')
  @CheckPolicies((ability) => ability.can('update', MovementSubject))
  syncMovements(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Body() body: { from?: string; to?: string },
  ) {
    const from = body.from ? new Date(body.from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = body.to ? new Date(body.to) : new Date();
    return this.bankingService.syncMovements(id, companyId, from, to);
  }

  @Get('connections/:id/sync-history')
  @CheckPolicies((ability) => ability.can('read', MovementSubject))
  getSyncHistory(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.bankingService.getSyncHistory(id, companyId);
  }

  @Get('connections/:id/movements')
  @CheckPolicies((ability) => ability.can('read', MovementSubject))
  getExternalMovements(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('isReconciled') isReconciled?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.bankingService.getExternalMovements(id, companyId, {
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      isReconciled: isReconciled === 'true' ? true : isReconciled === 'false' ? false : undefined,
      dateFrom,
      dateTo,
    });
  }
}
