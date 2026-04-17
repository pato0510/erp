-- Audit triggers for critical tables
-- These fire at the database level, making audit impossible to bypass
-- even with direct SQL access or if the NestJS app crashes mid-request.

-- 1. Generic audit trigger function
-- Reads audit.user_id and audit.company_id from transaction-local settings
-- injected by RlsService.executeWithRls() before each operation.
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
DECLARE
  audit_user_id TEXT;
  audit_company_id TEXT;
BEGIN
  -- Get context injected by NestJS at transaction start
  BEGIN
    audit_user_id := current_setting('audit.user_id', true);
    audit_company_id := current_setting('audit.company_id', true);
  EXCEPTION WHEN OTHERS THEN
    audit_user_id := NULL;
    audit_company_id := NULL;
  END;

  INSERT INTO audit_logs (
    "id", "tableName", "operation",
    "oldData", "newData",
    "userId", "tenantId", "createdAt"
  ) VALUES (
    gen_random_uuid(),
    TG_TABLE_NAME,
    TG_OP,
    CASE WHEN TG_OP = 'DELETE' OR TG_OP = 'UPDATE'
         THEN row_to_json(OLD) ELSE NULL END,
    CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE'
         THEN row_to_json(NEW) ELSE NULL END,
    NULLIF(audit_user_id, '')::uuid,
    NULLIF(audit_company_id, '')::uuid,
    NOW()
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Attach triggers to critical tables
CREATE TRIGGER audit_users
  AFTER INSERT OR UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_companies
  AFTER INSERT OR UPDATE OR DELETE ON companies
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_memberships
  AFTER INSERT OR UPDATE OR DELETE ON memberships
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
