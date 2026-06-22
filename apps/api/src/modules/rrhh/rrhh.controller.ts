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
import { AvailabilityStatus, CertificationStatus, CertificationType } from '@prisma/client';
import { CurrentCompany } from '../common/decorators/current-company.decorator';
import { JwtAuthGuard } from '../iam/guards/jwt-auth.guard';
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
import { CalculateFiniquitoDto } from './dto/calculate-finiquito.dto';
import { CalculatePayrollDto } from './dto/calculate-payroll.dto';
import { CreateAvailabilityDto } from './dto/create-availability.dto';
import { CreateCertificationDto } from './dto/create-certification.dto';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { CreateEmployeeDocumentDto } from './dto/create-employee-document.dto';
import { CreateLicenseDto } from './dto/create-license.dto';
import {
  CreateServiceRequirementDto,
  UpdateServiceRequirementDto,
} from './dto/service-requirement.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';
import { UpdateCertificationDto } from './dto/update-certification.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { UpdateEmployeeDocumentDto } from './dto/update-employee-document.dto';

/**
 * RRHH (DEMO) — single controller, base path `/rrhh`. Mirrors the
 * calendar/notifications posture: JwtAuthGuard only, company resolved from the
 * x-company-id header via @CurrentCompany(). Every query is companyId-scoped in
 * the services. CASL/RLS/audit are out of scope for this demo.
 *
 * Route ordering note: NestJS matches in declaration order, so all static
 * sub-paths (dashboard, payroll/*, finiquito/*, vacations/*, licenses/*,
 * documents/*) are declared BEFORE the `employees/:id` family.
 */
@Controller('rrhh')
@UseGuards(JwtAuthGuard)
export class RrhhController {
  constructor(
    private readonly employees: EmployeesService,
    private readonly dashboard: DashboardService,
    private readonly payroll: PayrollService,
    private readonly finiquito: FiniquitoService,
    private readonly vacations: VacationsService,
    private readonly licenses: LicensesService,
    private readonly documents: DocumentsService,
    private readonly certifications: CertificationsService,
    private readonly serviceRequirements: ServiceRequirementsService,
    private readonly availability: AvailabilityService,
  ) {}

  /* ── Dashboard ─────────────────────────────────────────────────── */

  @Get('dashboard')
  getDashboard(@CurrentCompany() companyId: string) {
    return this.dashboard.getDashboard(companyId);
  }

  /* ── Payroll ───────────────────────────────────────────────────── */

  @Get('payroll/parameters')
  getPayrollParameters(@CurrentCompany() companyId: string) {
    return this.payroll.getParameters(companyId);
  }

  @Post('payroll/calculate')
  calculatePayroll(@CurrentCompany() companyId: string, @Body() dto: CalculatePayrollDto) {
    return this.payroll.calculate(companyId, dto.sueldoBruto, dto.afp);
  }

  @Get('payroll/employee/:id')
  payrollForEmployee(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.payroll.calculateForEmployee(id, companyId);
  }

  /* ── Finiquito ─────────────────────────────────────────────────── */

  @Post('finiquito/calculate')
  calculateFiniquito(@CurrentCompany() companyId: string, @Body() dto: CalculateFiniquitoDto) {
    return this.finiquito.calculate(companyId, dto);
  }

  /* ── Vacaciones ────────────────────────────────────────────────── */

  @Get('vacations')
  listVacations(@CurrentCompany() companyId: string) {
    return this.vacations.findAll(companyId);
  }

  @Get('vacations/:employeeId')
  vacationsForEmployee(
    @Param('employeeId') employeeId: string,
    @CurrentCompany() companyId: string,
  ) {
    return this.vacations.findByEmployee(employeeId, companyId);
  }

  /* ── Licencias ─────────────────────────────────────────────────── */

  @Get('licenses')
  listLicenses(@CurrentCompany() companyId: string) {
    return this.licenses.findAll(companyId);
  }

  @Post('licenses')
  createLicense(@CurrentCompany() companyId: string, @Body() dto: CreateLicenseDto) {
    return this.licenses.create(companyId, dto);
  }

  @Get('licenses/employee/:id')
  licensesForEmployee(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.licenses.findByEmployee(id, companyId);
  }

  /* ── Certificaciones (habilitaciones del personal) ─────────────── */
  // Static `/expiring` declared BEFORE `/:id` so it is not swallowed.

  @Get('certifications/expiring')
  listExpiringCertifications(@CurrentCompany() companyId: string) {
    return this.certifications.findExpiring(companyId);
  }

  @Get('certifications')
  listCertifications(
    @CurrentCompany() companyId: string,
    @Query('employeeId') employeeId?: string,
    @Query('type') type?: CertificationType,
    @Query('status') status?: CertificationStatus,
  ) {
    return this.certifications.findAll(companyId, { employeeId, type, status });
  }

  @Post('certifications')
  createCertification(
    @CurrentCompany() companyId: string,
    @Body() dto: CreateCertificationDto,
  ) {
    return this.certifications.create(companyId, dto);
  }

  @Get('certifications/:id')
  getCertification(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.certifications.findOne(id, companyId);
  }

  @Patch('certifications/:id')
  updateCertification(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Body() dto: UpdateCertificationDto,
  ) {
    return this.certifications.update(id, companyId, dto);
  }

  @Delete('certifications/:id')
  removeCertification(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.certifications.remove(id, companyId);
  }

  /* ── Requisitos de servicio (mapa servicio → certificación) ─────── */

  @Get('service-requirements')
  listServiceRequirements(@CurrentCompany() companyId: string) {
    return this.serviceRequirements.findAll(companyId);
  }

  @Post('service-requirements')
  createServiceRequirement(
    @CurrentCompany() companyId: string,
    @Body() dto: CreateServiceRequirementDto,
  ) {
    return this.serviceRequirements.create(companyId, dto);
  }

  @Patch('service-requirements/:id')
  updateServiceRequirement(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Body() dto: UpdateServiceRequirementDto,
  ) {
    return this.serviceRequirements.update(id, companyId, dto);
  }

  @Delete('service-requirements/:id')
  removeServiceRequirement(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.serviceRequirements.remove(id, companyId);
  }

  /* ── Disponibilidad de personal ─────────────────────────────────── */
  // Static `/for-service` and `/calendar` declared BEFORE any `/:id`.

  @Get('availability/for-service')
  availabilityForService(
    @CurrentCompany() companyId: string,
    @Query('service') service: string,
    @Query('date') date?: string,
  ) {
    return this.availability.forService(companyId, service, date);
  }

  @Get('availability/calendar')
  availabilityCalendar(
    @CurrentCompany() companyId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.availability.calendar(companyId, from, to);
  }

  @Get('availability')
  listAvailability(
    @CurrentCompany() companyId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('cargo') cargo?: string,
    @Query('area') area?: string,
    @Query('status') status?: AvailabilityStatus,
  ) {
    return this.availability.findAll(companyId, { from, to, cargo, area, status });
  }

  @Post('availability')
  createAvailability(
    @CurrentCompany() companyId: string,
    @Body() dto: CreateAvailabilityDto,
  ) {
    return this.availability.create(companyId, dto);
  }

  @Patch('availability/:id')
  updateAvailability(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Body() dto: UpdateAvailabilityDto,
  ) {
    return this.availability.update(id, companyId, dto);
  }

  @Delete('availability/:id')
  removeAvailability(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.availability.remove(id, companyId);
  }

  /* ── Documentos (alert center + per-document mutations) ─────────── */

  @Get('documents')
  listAllDocuments(@CurrentCompany() companyId: string) {
    return this.documents.findAll(companyId);
  }

  @Patch('documents/:id')
  updateDocument(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Body() dto: UpdateEmployeeDocumentDto,
  ) {
    return this.documents.update(id, companyId, dto);
  }

  @Delete('documents/:id')
  removeDocument(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.documents.remove(id, companyId);
  }

  /* ── Empleados — documentos anidados ───────────────────────────── */

  @Get('employees/:id/documents')
  employeeDocuments(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.documents.findByEmployee(id, companyId);
  }

  @Post('employees/:id/documents')
  createEmployeeDocument(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Body() dto: CreateEmployeeDocumentDto,
  ) {
    return this.documents.create(id, companyId, dto);
  }

  /* ── Empleados — CRUD ──────────────────────────────────────────── */

  @Get('employees')
  listEmployees(@CurrentCompany() companyId: string) {
    return this.employees.findAll(companyId);
  }

  @Post('employees')
  createEmployee(@CurrentCompany() companyId: string, @Body() dto: CreateEmployeeDto) {
    return this.employees.create(companyId, dto);
  }

  @Get('employees/:id')
  getEmployee(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.employees.findOne(id, companyId);
  }

  @Patch('employees/:id')
  updateEmployee(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employees.update(id, companyId, dto);
  }

  @Delete('employees/:id')
  removeEmployee(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.employees.remove(id, companyId);
  }
}
