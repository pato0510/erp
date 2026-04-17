import { PrismaClient } from '@prisma/client';

/**
 * RLS Security Test
 *
 * This test proves that PostgreSQL Row Level Security correctly isolates
 * data between companies. Even without WHERE clauses in application code,
 * the database prevents Company B from seeing Company A's data.
 *
 * Run with: npx ts-node apps/api/src/modules/common/rls/rls.security.spec.ts
 */

const prisma = new PrismaClient();

async function runSecurityTest() {
  console.log('=== RLS Security Test ===\n');

  // 1. Create a test tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'rls-test-tenant' },
    update: {},
    create: { name: 'RLS Test Tenant', slug: 'rls-test-tenant' },
  });

  // 2. Create Company A and Company B
  let companyA = await prisma.company.findFirst({
    where: { tenantId: tenant.id, taxId: 'RLS-A' },
  });
  if (!companyA) {
    companyA = await prisma.company.create({
      data: {
        tenantId: tenant.id,
        name: 'Company A',
        taxId: 'RLS-A',
        legalName: 'Company A SpA',
      },
    });
  }

  let companyB = await prisma.company.findFirst({
    where: { tenantId: tenant.id, taxId: 'RLS-B' },
  });
  if (!companyB) {
    companyB = await prisma.company.create({
      data: {
        tenantId: tenant.id,
        name: 'Company B',
        taxId: 'RLS-B',
        legalName: 'Company B SpA',
      },
    });
  }

  console.log(`Company A: ${companyA.id}`);
  console.log(`Company B: ${companyB.id}`);

  // 3. Without RLS (superuser/BYPASSRLS): can see all companies
  const allCompanies = await prisma.company.findMany({
    where: { tenantId: tenant.id, taxId: { startsWith: 'RLS-' } },
  });
  console.log(`\nWithout RLS: found ${allCompanies.length} companies (expected 2)`);

  if (allCompanies.length !== 2) {
    throw new Error(`FAIL: Expected 2 companies without RLS, got ${allCompanies.length}`);
  }

  // 4. With RLS set to Company A: should only see Company A
  const companiesAsA = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL rls.company_id = '${companyA.id}'`);
    // Force RLS by setting role to app_user for this transaction
    await tx.$executeRawUnsafe(`SET LOCAL ROLE app_user`);
    return tx.company.findMany({
      where: { tenantId: tenant.id, taxId: { startsWith: 'RLS-' } },
    });
  });

  console.log(`With RLS (Company A): found ${companiesAsA.length} company (expected 1)`);
  if (companiesAsA.length !== 1) {
    throw new Error(`FAIL: Expected 1 company with RLS=A, got ${companiesAsA.length}`);
  }
  if (companiesAsA[0].id !== companyA.id) {
    throw new Error(`FAIL: Expected Company A id, got ${companiesAsA[0].id}`);
  }

  // 5. With RLS set to Company B: should only see Company B (NOT Company A)
  const companiesAsB = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL rls.company_id = '${companyB.id}'`);
    await tx.$executeRawUnsafe(`SET LOCAL ROLE app_user`);
    return tx.company.findMany({
      where: { tenantId: tenant.id, taxId: { startsWith: 'RLS-' } },
    });
  });

  console.log(`With RLS (Company B): found ${companiesAsB.length} company (expected 1)`);
  if (companiesAsB.length !== 1) {
    throw new Error(`FAIL: Expected 1 company with RLS=B, got ${companiesAsB.length}`);
  }
  if (companiesAsB[0].id !== companyB.id) {
    throw new Error(`FAIL: Expected Company B id, got ${companiesAsB[0].id}`);
  }

  // 6. With RLS set to a non-existent company: should see 0 rows
  const companiesAsNone = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL rls.company_id = '00000000-0000-0000-0000-000000000000'`);
    await tx.$executeRawUnsafe(`SET LOCAL ROLE app_user`);
    return tx.company.findMany({
      where: { tenantId: tenant.id, taxId: { startsWith: 'RLS-' } },
    });
  });

  console.log(`With RLS (non-existent): found ${companiesAsNone.length} companies (expected 0)`);
  if (companiesAsNone.length !== 0) {
    throw new Error(`FAIL: Expected 0 companies with fake RLS, got ${companiesAsNone.length}`);
  }

  console.log('\n=== ALL RLS SECURITY TESTS PASSED ===');
}

runSecurityTest()
  .catch((e) => {
    console.error('\n=== RLS SECURITY TEST FAILED ===');
    console.error(e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
