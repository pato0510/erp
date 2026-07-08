import { Module } from '@nestjs/common';
import { AlertRulesModule } from '../operations/alerts/alert-rules.module';
import { CommitmentTemplatesModule } from '../operations/commitment-templates/commitment-templates.module';
import { OperationsListenersService } from './operations-listeners.service';
import { OpportunityCommitmentListener } from './opportunity-commitment.listener';

/* OPS-033 — Finance module hosts the operations event listeners
   and now creates real Commitment rows on renewal events. We
   import AlertRulesModule for CompanyAlertSettingsService (the
   `enableAutoCommitments` toggle) and CommitmentTemplatesModule
   for the cost-estimation surface. PrismaService and RlsService
   are global.

   COM-014 — OpportunityCommitmentListener is the SECOND listener on
   comercial.opportunity-won (Operaciones has the first): it creates
   the projected-income Commitment. It reuses CompanyAlertSettingsService
   (enableAutoCommitments) from AlertRulesModule — no new import needed. */
@Module({
  imports: [AlertRulesModule, CommitmentTemplatesModule],
  providers: [OperationsListenersService, OpportunityCommitmentListener],
  exports: [OperationsListenersService],
})
export class FinanceModule {}
