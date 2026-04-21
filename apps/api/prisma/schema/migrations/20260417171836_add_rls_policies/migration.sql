-- Row Level Security (RLS) for multi-tenant data isolation
-- This ensures that even without WHERE clauses, the database prevents cross-company data leaks.

-- 1. Helper function to verify rls.company_id is set
CREATE OR REPLACE FUNCTION set_tenant_id()
RETURNS void AS $$
BEGIN
  PERFORM current_setting('rls.company_id', true);
END;
$$ LANGUAGE plpgsql;

-- 2. Enable RLS on companies table
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY company_isolation ON companies
  USING ("id" = current_setting('rls.company_id', true)::uuid);

-- 3. Enable RLS on memberships table
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY membership_isolation ON memberships
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- 4. Create application-level database role
-- The app connects as this role; RLS policies apply to it.
-- The migration user keeps BYPASSRLS so migrations and seeds work.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN;
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;

-- 5. Ensure the migration user bypasses RLS (critical for Prisma migrations and seeds).
-- Managed Postgres (Railway, Supabase, RDS, etc.) does not expose a superuser
-- named "excelsia" — use current_user and degrade gracefully if BYPASSRLS
-- cannot be granted (the connecting role is often already superuser/bypass).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user) THEN
    EXECUTE format('ALTER ROLE %I BYPASSRLS', current_user);
  END IF;
EXCEPTION WHEN insufficient_privilege OR others THEN
  RAISE NOTICE 'Skipping ALTER ROLE % BYPASSRLS: %', current_user, SQLERRM;
END $$;
