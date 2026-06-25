import { Module } from '@nestjs/common';
import { RrhhController } from './rrhh.controller';
import { JobPositionsModule } from './job-positions/job-positions.module';
import { EmployeesModule } from './employees/employees.module';
import { EmployeeDocumentsModule } from './employee-documents/employee-documents.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { EmployeeContractsModule } from './contracts/employee-contracts.module';
import { VacationsModule } from './vacations/vacations.module';
import { AbsencesModule } from './absences/absences.module';
import { PayrollParametersModule } from './payroll-parameters/payroll-parameters.module';
import { SettlementsModule } from './settlements/settlements.module';

/* RRHH module aggregator. HR-001 added the gated health controller; HR-002
 * JobPositionsModule (cargos); HR-003 EmployeesModule (employees + guarded
 * compensation); HR-004a EmployeeDocumentsModule (document types + requirements
 * matrix + records, copy-adapted from the Operations doc-control engine).
 * Further submodules (contracts, certifications, …) are imported here as their
 * tickets land — mirroring how OperationsModule aggregates its feature
 * submodules. PoliciesGuard / CaslAbilityFactory / PrismaService are provided by
 * the global Casl/Prisma modules. */
@Module({
  imports: [
    JobPositionsModule,
    EmployeesModule,
    EmployeeDocumentsModule,
    DashboardModule,
    EmployeeContractsModule,
    VacationsModule,
    AbsencesModule,
    PayrollParametersModule,
    SettlementsModule,
  ],
  controllers: [RrhhController],
})
export class RrhhModule {}
