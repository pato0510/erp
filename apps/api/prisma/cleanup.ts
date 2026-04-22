import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function cleanup() {
  console.log('Starting cleanup...');

  // Delete in order (children before parents)
  await prisma.reconciliationMatch.deleteMany({});
  console.log('✓ Reconciliation matches cleared');

  await prisma.bankSyncRun.deleteMany({});
  await prisma.externalBankMovement.deleteMany({});
  await prisma.bankConnection.deleteMany({});
  console.log('✓ Bank data cleared');

  await prisma.taxSyncRun.deleteMany({});
  await prisma.taxDocument.deleteMany({});
  console.log('✓ Tax documents cleared');

  await prisma.alert.deleteMany({});
  console.log('✓ Alerts cleared');

  await prisma.importLog.deleteMany({});
  await prisma.movement.deleteMany({});
  console.log('✓ Movements cleared');

  await prisma.commitment.deleteMany({});
  console.log('✓ Commitments cleared');

  await prisma.accountBalance.deleteMany({});
  await prisma.bankAccount.deleteMany({});
  console.log('✓ Bank accounts cleared');

  await prisma.auditLog.deleteMany({});
  console.log('✓ Audit logs cleared');

  await prisma.alertThreshold.deleteMany({});
  console.log('✓ Alert thresholds cleared');

  await prisma.fiscalPeriod.deleteMany({});
  console.log('✓ Fiscal periods cleared');

  await prisma.costCenter.deleteMany({});
  await prisma.counterparty.deleteMany({});
  await prisma.category.deleteMany({});
  console.log('✓ Catalogs cleared');

  await prisma.companySettings.deleteMany({});
  console.log('✓ Company settings cleared');

  // DO NOT delete: users, memberships, companies, tenants
  console.log('✓ Users and companies preserved');
  console.log('Cleanup complete.');
}

cleanup()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
