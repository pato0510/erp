-- CreateTable
CREATE TABLE "payroll_parameter_sets" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "topeImponibleAfpSaludUf" DECIMAL(8,2) NOT NULL,
    "topeImponibleAfcUf" DECIMAL(8,2) NOT NULL,
    "tasaAfpObligatoria" DECIMAL(6,3) NOT NULL,
    "tasaSalud" DECIMAL(6,3) NOT NULL,
    "tasaAfcIndefinidoTrabajador" DECIMAL(6,3) NOT NULL,
    "tasaAfcIndefinidoEmpleador" DECIMAL(6,3) NOT NULL,
    "tasaAfcPlazoFijoEmpleador" DECIMAL(6,3) NOT NULL,
    "tasaSis" DECIMAL(6,3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdBy" UUID NOT NULL,
    "updatedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_parameter_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "afp_rates" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "parameterSetId" UUID NOT NULL,
    "afpName" TEXT NOT NULL,
    "comisionPorcentaje" DECIMAL(6,3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" UUID NOT NULL,
    "updatedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "afp_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payroll_parameter_sets_companyId_name_key" ON "payroll_parameter_sets"("companyId", "name");

-- CreateIndex
CREATE INDEX "payroll_parameter_sets_companyId_idx" ON "payroll_parameter_sets"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "afp_rates_parameterSetId_afpName_key" ON "afp_rates"("parameterSetId", "afpName");

-- CreateIndex
CREATE INDEX "afp_rates_companyId_idx" ON "afp_rates"("companyId");

-- AddForeignKey
ALTER TABLE "afp_rates" ADD CONSTRAINT "afp_rates_parameterSetId_fkey" FOREIGN KEY ("parameterSetId") REFERENCES "payroll_parameter_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- HR-008 — platform invariant for BOTH new tables, templated VERBATIM from
-- document_records (20260428170000) / RRHH-RECON.md checklist: company-isolation
-- RLS policy + audit trigger (reusing the platform audit_trigger_function) + the
-- app_user GRANT. Kept in the migration so production gets it on deploy.
-- ─────────────────────────────────────────────────────────────────────────

-- RLS — payroll_parameter_sets
ALTER TABLE payroll_parameter_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY payroll_parameter_sets_isolation ON payroll_parameter_sets
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants — payroll_parameter_sets
GRANT SELECT, INSERT, UPDATE, DELETE ON payroll_parameter_sets TO app_user;

-- Audit trigger — payroll_parameter_sets
CREATE TRIGGER audit_payroll_parameter_sets
  AFTER INSERT OR UPDATE OR DELETE ON payroll_parameter_sets
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- RLS — afp_rates
ALTER TABLE afp_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY afp_rates_isolation ON afp_rates
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants — afp_rates
GRANT SELECT, INSERT, UPDATE, DELETE ON afp_rates TO app_user;

-- Audit trigger — afp_rates
CREATE TRIGGER audit_afp_rates
  AFTER INSERT OR UPDATE OR DELETE ON afp_rates
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
