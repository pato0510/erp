import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DomainEventStatus } from '@prisma/client';
import { DomainEventSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { DomainEventsService } from './domain-events.service';
import { EVENT_TYPES, OperationsDomainEvent, EventTypeName } from './domain-event-types';

/* OPS-032 — admin-facing audit endpoints. `read` is granted to
   ADMIN/MANAGER (manager via blanket `read all`); retry/test are
   ADMIN-only via the `manage` action. */
@Controller('operations/domain-events')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class DomainEventsController {
  constructor(private readonly service: DomainEventsService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', DomainEventSubject))
  list(
    @CurrentCompany() companyId: string,
    @Query('eventType') eventType?: string,
    @Query('aggregateType') aggregateType?: string,
    @Query('aggregateId') aggregateId?: string,
    @Query('status') status?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findEvents(companyId, {
      eventType,
      aggregateType,
      aggregateId,
      status: parseStatus(status),
      dateFrom,
      dateTo,
      page: page ? Number.parseInt(page, 10) : undefined,
      limit: limit ? Number.parseInt(limit, 10) : undefined,
    });
  }

  @Get('stats')
  @CheckPolicies((ability) => ability.can('read', DomainEventSubject))
  stats(@CurrentCompany() companyId: string, @Query('days') days?: string) {
    const parsed = days ? Number.parseInt(days, 10) : 30;
    return this.service.getStats(companyId, Number.isFinite(parsed) ? parsed : 30);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', DomainEventSubject))
  async findOne(@CurrentCompany() companyId: string, @Param('id') id: string) {
    const row = await this.service.findOne(companyId, id);
    if (!row) throw new NotFoundException('Evento no encontrado.');
    return row;
  }

  @Post(':id/retry')
  @CheckPolicies((ability) => ability.can('manage', DomainEventSubject))
  async retry(@CurrentCompany() companyId: string, @Param('id') id: string) {
    return this.service.retrySingle(companyId, id);
  }

  /* OPS-032 part 8 — manual emission for debugging in dev/staging.
     Type-checks the payload against the union; ADMIN only. */
  @Post('test')
  @CheckPolicies((ability) => ability.can('manage', DomainEventSubject))
  async test(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() body: { type?: string; payload?: Record<string, unknown> },
  ) {
    if (!body?.type || !body?.payload) {
      throw new BadRequestException('Indica `type` y `payload`.');
    }
    if (!(EVENT_TYPES as readonly string[]).includes(body.type)) {
      throw new BadRequestException(`Tipo desconocido. Usa uno de: ${EVENT_TYPES.join(', ')}.`);
    }
    /* Force the companyId on the synthesized event so the test row
       can't escape the caller's tenant. */
    const event = {
      ...body.payload,
      type: body.type as EventTypeName,
      companyId,
      occurredAt:
        typeof body.payload.occurredAt === 'string'
          ? body.payload.occurredAt
          : new Date().toISOString(),
    } as OperationsDomainEvent;
    const id = await this.service.emit(event);
    return { id, emittedBy: user.id };
  }
}

function parseStatus(input: string | undefined): DomainEventStatus | undefined {
  if (!input) return undefined;
  const upper = input.toUpperCase();
  if (upper === 'PENDING' || upper === 'PROCESSED' || upper === 'FAILED') {
    return upper as DomainEventStatus;
  }
  return undefined;
}
