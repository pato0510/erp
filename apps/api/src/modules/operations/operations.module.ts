import { Module } from '@nestjs/common';
import { AlertRulesModule } from './alerts/alert-rules.module';
import { AssetsModule } from './assets/assets.module';
import { AssetTypesModule } from './asset-types/asset-types.module';
import { OperationsCalendarModule } from './calendar/operations-calendar.module';
import { CommitmentTemplatesModule } from './commitment-templates/commitment-templates.module';
import { OperationsDashboardModule } from './dashboard/operations-dashboard.module';
import { DocumentControlModule } from './document-control/document-control.module';
import { DocumentRequirementsModule } from './document-requirements/document-requirements.module';
import { DocumentTypesModule } from './document-types/document-types.module';
import { ExceptionsModule } from './exceptions/exceptions.module';
import { FleetModule } from './fleet/fleet.module';
import { LocationsModule } from './locations/locations.module';
import { NotificationModule } from './notifications/notification.module';
import { PermitsModule } from './permits/permits.module';
import { ProceduresModule } from './procedures/procedures.module';
import { OperationsReportsModule } from './reports/operations-reports.module';

@Module({
  imports: [
    AlertRulesModule,
    AssetsModule,
    AssetTypesModule,
    CommitmentTemplatesModule,
    DocumentControlModule,
    DocumentRequirementsModule,
    DocumentTypesModule,
    ExceptionsModule,
    FleetModule,
    LocationsModule,
    NotificationModule,
    OperationsCalendarModule,
    OperationsDashboardModule,
    OperationsReportsModule,
    PermitsModule,
    ProceduresModule,
  ],
})
export class OperationsModule {}
