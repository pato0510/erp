-- RRHH (DEMO) module — additive schema. Hand-authored to contain ONLY the new
-- RRHH tables/enums/indexes/FKs (the auto-diff against this dev DB also
-- surfaced unrelated drift from a budgets branch + index renames, which are
-- intentionally excluded here so this migration never touches Finance or
-- Operations objects).

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVO', 'INACTIVO');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('INDEFINIDO', 'PLAZO_FIJO', 'POR_OBRA', 'HONORARIOS');

-- CreateEnum
CREATE TYPE "LicenseType" AS ENUM ('ENFERMEDAD_COMUN', 'ACCIDENTE', 'MATERNAL', 'OTRO');

-- CreateEnum
CREATE TYPE "LicenseStatus" AS ENUM ('VIGENTE', 'FINALIZADA', 'RECHAZADA');

-- CreateEnum
CREATE TYPE "EmployeeDocumentStatus" AS ENUM ('DRAFT', 'VIGENTE', 'POR_VENCER', 'VENCIDO');

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "rut" TEXT NOT NULL,
    "nombres" TEXT NOT NULL,
    "apellidos" TEXT NOT NULL,
    "email" TEXT,
    "telefono" TEXT,
    "direccion" TEXT,
    "comuna" TEXT,
    "ciudad" TEXT,
    "fechaNacimiento" DATE,
    "fechaIngreso" DATE NOT NULL,
    "area" TEXT NOT NULL,
    "cargo" TEXT NOT NULL,
    "estado" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_contracts" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "tipoContrato" "ContractType" NOT NULL DEFAULT 'INDEFINIDO',
    "sueldoBruto" DECIMAL(12,2) NOT NULL,
    "jornada" TEXT NOT NULL DEFAULT '45h',
    "cargo" TEXT NOT NULL,
    "fechaInicio" DATE NOT NULL,
    "fechaFin" DATE,
    "afp" TEXT NOT NULL,
    "salud" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_parameters" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "periodo" TEXT NOT NULL,
    "ufValue" DECIMAL(14,4) NOT NULL,
    "utmValue" DECIMAL(14,4) NOT NULL,
    "topeImponibleUf" DECIMAL(8,4) NOT NULL,
    "topeCesantiaUf" DECIMAL(8,4) NOT NULL,
    "afpRates" JSONB NOT NULL,
    "saludRate" DECIMAL(6,4) NOT NULL,
    "cesantiaRateTrabajador" DECIMAL(6,4) NOT NULL,
    "taxBrackets" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_parameters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vacation_records" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "mesesTrabajados" INTEGER NOT NULL,
    "diasTomados" DECIMAL(6,2) NOT NULL,
    "fechaCorte" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vacation_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licenses" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "tipo" "LicenseType" NOT NULL,
    "fechaInicio" DATE NOT NULL,
    "fechaFin" DATE NOT NULL,
    "dias" INTEGER NOT NULL,
    "folio" TEXT,
    "estado" "LicenseStatus" NOT NULL DEFAULT 'VIGENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "licenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_documents" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "tipoDocumento" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "fechaEmision" DATE,
    "fechaVencimiento" DATE,
    "estado" "EmployeeDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "fileName" TEXT,
    "mimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employees_companyId_estado_idx" ON "employees"("companyId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "employees_companyId_rut_key" ON "employees"("companyId", "rut");

-- CreateIndex
CREATE INDEX "employee_contracts_companyId_employeeId_idx" ON "employee_contracts"("companyId", "employeeId");

-- CreateIndex
CREATE INDEX "employee_contracts_companyId_activo_idx" ON "employee_contracts"("companyId", "activo");

-- CreateIndex
CREATE INDEX "payroll_parameters_companyId_isActive_idx" ON "payroll_parameters"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_parameters_companyId_periodo_key" ON "payroll_parameters"("companyId", "periodo");

-- CreateIndex
CREATE INDEX "vacation_records_companyId_employeeId_idx" ON "vacation_records"("companyId", "employeeId");

-- CreateIndex
CREATE INDEX "licenses_companyId_employeeId_idx" ON "licenses"("companyId", "employeeId");

-- CreateIndex
CREATE INDEX "employee_documents_companyId_employeeId_idx" ON "employee_documents"("companyId", "employeeId");

-- CreateIndex
CREATE INDEX "employee_documents_companyId_fechaVencimiento_idx" ON "employee_documents"("companyId", "fechaVencimiento");

-- AddForeignKey
ALTER TABLE "employee_contracts" ADD CONSTRAINT "employee_contracts_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vacation_records" ADD CONSTRAINT "vacation_records_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
