import { Module } from '@nestjs/common';
import { AlertRulesModule } from '../operations/alerts/alert-rules.module';
import { CommitmentTemplatesModule } from '../operations/commitment-templates/commitment-templates.module';
import { OperationsListenersService } from './operations-listeners.service';

/* OPS-033 — Finance module hosts the operations event listeners
   and now creates real Commitment rows on renewal events. We
   import AlertRulesModule for CompanyAlertSettingsService (the
   `enableAutoCommitments` toggle) and CommitmentTemplatesModule
   for the cost-estimation surface. PrismaService and RlsService
   are global. */
@Module({
  imports: [AlertRulesModule, CommitmentTemplatesModule],
  providers: [OperationsListenersService],
  exports: [OperationsListenersService],
})
export class FinanceModule {}
