import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DocumentDirection, DocumentType } from '@prisma/client';
import { TaxService } from './tax.service';
import { JwtAuthGuard } from '../iam/guards/jwt-auth.guard';
import { PoliciesGuard } from '../common/guards/policies.guard';
import { CheckPolicies } from '../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../common/decorators/current-company.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MovementSubject } from '../common/casl/casl-ability.factory';

const DIRECTIONS: DocumentDirection[] = ['EMITIDO', 'RECIBIDO'];

const DOCUMENT_TYPES: DocumentType[] = [
  'FACTURA_ELECTRONICA',
  'BOLETA_ELECTRONICA',
  'NOTA_CREDITO',
  'NOTA_DEBITO',
  'LIQUIDACION_FACTURA',
  'FACTURA_NO_AFECTA',
];

@Controller('tax')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class TaxController {
  private readonly logger = new Logger(TaxController.name);

  constructor(private readonly taxService: TaxService) {}

  @Post('sync')
  @CheckPolicies((ability) => ability.can('update', MovementSubject))
  async sync(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Query('fiscalPeriodId') qsFiscalPeriodId: string | undefined,
    @Query('direction') qsDirection: string | undefined,
    @Body() body: { fiscalPeriodId?: string; direction?: string } = {},
  ) {
    // Accept params from either query string or JSON body so the endpoint
    // works with both calling styles. Body wins when both are present.
    const fiscalPeriodId = body.fiscalPeriodId ?? qsFiscalPeriodId;
    const direction = body.direction ?? qsDirection;

    this.logger.log(
      `POST /tax/sync company=${companyId} fiscalPeriodId=${fiscalPeriodId} direction=${direction}`,
    );

    if (!fiscalPeriodId) throw new BadRequestException('fiscalPeriodId is required');
    if (!DIRECTIONS.includes(direction as DocumentDirection)) {
      throw new BadRequestException(`direction must be one of: ${DIRECTIONS.join(', ')}`);
    }
    return this.taxService.syncDocuments(
      companyId,
      user.id,
      fiscalPeriodId,
      direction as DocumentDirection,
    );
  }

  @Post('sync-all')
  @CheckPolicies((ability) => ability.can('update', MovementSubject))
  async syncAll(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Query('fiscalPeriodId') qsFiscalPeriodId: string | undefined,
    @Body() body: { fiscalPeriodId?: string } = {},
  ) {
    const fiscalPeriodId = body.fiscalPeriodId ?? qsFiscalPeriodId;

    this.logger.log(`POST /tax/sync-all company=${companyId} fiscalPeriodId=${fiscalPeriodId}`);

    if (!fiscalPeriodId) throw new BadRequestException('fiscalPeriodId is required');
    return this.taxService.syncAll(companyId, user.id, fiscalPeriodId);
  }

  @Post('test-connection')
  @CheckPolicies((ability) => ability.can('read', MovementSubject))
  async testConnection() {
    return this.taxService.testConnection();
  }

  @Get('documents')
  @CheckPolicies((ability) => ability.can('read', MovementSubject))
  findDocuments(
    @CurrentCompany() companyId: string,
    @Query('direction') direction?: string,
    @Query('type') type?: string,
    @Query('fiscalPeriodId') fiscalPeriodId?: string,
    @Query('isReconciled') isReconciled?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    if (direction && !DIRECTIONS.includes(direction as DocumentDirection)) {
      throw new BadRequestException(`direction must be one of: ${DIRECTIONS.join(', ')}`);
    }
    if (type && !DOCUMENT_TYPES.includes(type as DocumentType)) {
      throw new BadRequestException(`type must be a valid DocumentType`);
    }
    return this.taxService.findDocuments(companyId, {
      direction: direction as DocumentDirection | undefined,
      type: type as DocumentType | undefined,
      fiscalPeriodId,
      isReconciled: isReconciled === 'true' ? true : isReconciled === 'false' ? false : undefined,
      dateFrom,
      dateTo,
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('documents/:id')
  @CheckPolicies((ability) => ability.can('read', MovementSubject))
  getDocument(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.taxService.getDocument(id, companyId);
  }

  @Get('summary')
  @CheckPolicies((ability) => ability.can('read', MovementSubject))
  getSummary(
    @CurrentCompany() companyId: string,
    @Query('fiscalPeriodId') fiscalPeriodId?: string,
  ) {
    return this.taxService.getSummary(companyId, fiscalPeriodId);
  }

  @Get('pending-categorization')
  @CheckPolicies((ability) => ability.can('read', MovementSubject))
  findPendingCategorization(@CurrentCompany() companyId: string) {
    return this.taxService.findPendingCategorization(companyId);
  }
}
