import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

/**
 * Audit Trigger Test
 *
 * Proves that PostgreSQL triggers automatically capture audit entries
 * when data is inserted, updated, or deleted — with user_id and company_id
 * from the transaction-local settings.
 *
 * Run with: npx ts-node apps/api/src/modules/audit/audit.spec.ts
 */

const prisma = new PrismaClient();

async function runAuditTest() {
  console.log('=== Audit Trigger Test ===\n');

  // 1. Setup: create tenant and company for the test
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'audit-test-tenant' },
    update: {},
    create: { name: 'Audit Test Tenant', slug: 'audit-test-tenant' },
  });

  let company = await prisma.company.findFirst({
    where: { tenantId: tenant.id, taxId: 'AUDIT-TEST' },
  });
  if (!company) {
    company = await prisma.company.create({
      data: {
        tenantId: tenant.id,
        name: 'Audit Test Company',
        taxId: 'AUDIT-TEST',
        legalName: 'Audit Test SpA',
      },
    });
  }

  // Clear any previous audit test entries for this user email
  const existingUser = await prisma.user.findUnique({
    where: { email: 'audit-test@excelsia.dev' },
  });
  if (existingUser) {
    await prisma.membership.deleteMany({ where: { userId: existingUser.id } });
    await prisma.user.delete({ where: { id: existingUser.id } });
  }

  // 2. Record the audit_logs count before our test
  const countBefore = await prisma.auditLog.count();
  console.log(`Audit log entries before test: ${countBefore}`);

  // Use a known fake user ID for the audit context
  const fakeActorId = '00000000-aaaa-bbbb-cccc-000000000001';

  // 3. INSERT: create a user inside a transaction with audit context
  const testUser = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL audit.user_id = '${fakeActorId}'`);
    await tx.$executeRawUnsafe(`SET LOCAL audit.company_id = '${company.id}'`);

    return tx.user.create({
      data: {
        email: 'audit-test@excelsia.dev',
        passwordHash: await bcrypt.hash('TestPass1234!', 10),
        firstName: 'Audit',
        lastName: 'Test',
      },
    });
  });

  console.log(`\nCreated test user: ${testUser.id}`);

  // 4. Verify INSERT audit entry was recorded
  const insertEntry = await prisma.auditLog.findFirst({
    where: {
      tableName: 'users',
      operation: 'INSERT',
      userId: fakeActorId,
      tenantId: company.id,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!insertEntry) {
    throw new Error('FAIL: No INSERT audit entry found for test user');
  }
  console.log('INSERT audit entry found:');
  console.log(`  tableName: ${insertEntry.tableName}`);
  console.log(`  operation: ${insertEntry.operation}`);
  console.log(`  userId (actor): ${insertEntry.userId}`);
  console.log(`  tenantId (company): ${insertEntry.tenantId}`);

  if (insertEntry.userId !== fakeActorId) {
    throw new Error(`FAIL: Expected userId=${fakeActorId}, got ${insertEntry.userId}`);
  }
  if (insertEntry.tenantId !== company.id) {
    throw new Error(`FAIL: Expected tenantId=${company.id}, got ${insertEntry.tenantId}`);
  }

  // Verify newData contains the created user's email
  const newData = insertEntry.newData as Record<string, unknown>;
  if (newData?.email !== 'audit-test@excelsia.dev') {
    throw new Error(`FAIL: newData.email mismatch: ${JSON.stringify(newData)}`);
  }
  console.log(`  newData.email: ${newData.email}`);

  // 5. UPDATE: update the user and verify audit
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL audit.user_id = '${fakeActorId}'`);
    await tx.$executeRawUnsafe(`SET LOCAL audit.company_id = '${company.id}'`);
    return tx.user.update({
      where: { id: testUser.id },
      data: { firstName: 'AuditUpdated' },
    });
  });

  const updateEntry = await prisma.auditLog.findFirst({
    where: {
      tableName: 'users',
      operation: 'UPDATE',
      userId: fakeActorId,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!updateEntry) {
    throw new Error('FAIL: No UPDATE audit entry found');
  }

  const oldData = updateEntry.oldData as Record<string, unknown>;
  const updatedNewData = updateEntry.newData as Record<string, unknown>;
  console.log(`\nUPDATE audit entry found:`);
  console.log(`  oldData.firstName: ${oldData?.firstName}`);
  console.log(`  newData.firstName: ${updatedNewData?.firstName}`);

  if (oldData?.firstName !== 'Audit' || updatedNewData?.firstName !== 'AuditUpdated') {
    throw new Error('FAIL: UPDATE old/new data mismatch');
  }

  // 6. DELETE: delete the user and verify audit
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL audit.user_id = '${fakeActorId}'`);
    await tx.$executeRawUnsafe(`SET LOCAL audit.company_id = '${company.id}'`);
    return tx.user.delete({ where: { id: testUser.id } });
  });

  const deleteEntry = await prisma.auditLog.findFirst({
    where: {
      tableName: 'users',
      operation: 'DELETE',
      userId: fakeActorId,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!deleteEntry) {
    throw new Error('FAIL: No DELETE audit entry found');
  }
  console.log(`\nDELETE audit entry found:`);
  console.log(`  oldData.email: ${(deleteEntry.oldData as Record<string, unknown>)?.email}`);

  // 7. Count total new audit entries
  const countAfter = await prisma.auditLog.count();
  const newEntries = countAfter - countBefore;
  console.log(`\nNew audit entries created during test: ${newEntries}`);

  if (newEntries < 3) {
    throw new Error(`FAIL: Expected at least 3 new audit entries, got ${newEntries}`);
  }

  console.log('\n=== ALL AUDIT TRIGGER TESTS PASSED ===');
}

runAuditTest()
  .catch((e) => {
    console.error('\n=== AUDIT TRIGGER TEST FAILED ===');
    console.error(e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
