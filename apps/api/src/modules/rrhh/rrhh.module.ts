import { Module } from '@nestjs/common';
import { RrhhController } from './rrhh.controller';
import { AvailabilityService } from './availability.service';
import { CertificationsService } from './certifications.service';
import { DashboardService } from './dashboard.service';
import { DocumentsService } from './documents.service';
import { EmployeesService } from './employees.service';
import { FiniquitoService } from './finiquito.service';
import { LicensesService } from './licenses.service';
import { PayrollService } from './payroll.service';
import { ServiceRequirementsService } from './service-requirements.service';
import { VacationsService } from './vacations.service';

/**
 * RRHH (DEMO) — shared foundation module. PrismaModule is @Global, so
 * PrismaService is injected directly. No RLS/CASL wiring (demo scope).
 */
@Module({
  controllers: [RrhhController],
  providers: [
    EmployeesService,
    DashboardService,
    PayrollService,
    FiniquitoService,
    VacationsService,
    LicensesService,
    DocumentsService,
    CertificationsService,
    ServiceRequirementsService,
    AvailabilityService,
  ],
  exports: [EmployeesService, PayrollService, AvailabilityService],
})
export class RrhhModule {}
