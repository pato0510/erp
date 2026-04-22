import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface Step {
  name: string;
  run: () => Promise<{ count: number }>;
}

// Order matters — children before parents to respect foreign keys.
// Preserved tables: user, membership, company, tenant.
const steps: Step[] = [
  { name: 'reconciliationMatch', run: () => prisma.reconciliationMatch.deleteMany() },
  { name: 'bankSyncRun', run: () => prisma.bankSyncRun.deleteMany() },
  { name: 'externalBankMovement', run: () => prisma.externalBankMovement.deleteMany() },
  { name: 'bankConnection', run: () => prisma.bankConnection.deleteMany() },
  { name: 'taxSyncRun', run: () => prisma.taxSyncRun.deleteMany() },
  { name: 'taxDocument', run: () => prisma.taxDocument.deleteMany() },
  { name: 'alert', run: () => prisma.alert.deleteMany() },
  { name: 'alertThreshold', run: () => prisma.alertThreshold.deleteMany() },
  { name: 'importLog', run: () => prisma.importLog.deleteMany() },
  { name: 'movement', run: () => prisma.movement.deleteMany() },
  { name: 'commitment', run: () => prisma.commitment.deleteMany() },
  { name: 'accountBalance', run: () => prisma.accountBalance.deleteMany() },
  { name: 'bankAccount', run: () => prisma.bankAccount.deleteMany() },
  { name: 'auditLog', run: () => prisma.auditLog.deleteMany() },
  { name: 'fiscalPeriod', run: () => prisma.fiscalPeriod.deleteMany() },
  { name: 'costCenter', run: () => prisma.costCenter.deleteMany() },
  { name: 'counterparty', run: () => prisma.counterparty.deleteMany() },
  { name: 'category', run: () => prisma.category.deleteMany() },
  { name: 'companySettings', run: () => prisma.companySettings.deleteMany() },
];

async function main() {
  console.log('→ Cleanup iniciando...');
  console.log('  Preservando: user, membership, company, tenant');
  console.log('');

  let total = 0;
  for (const step of steps) {
    const result = await step.run();
    total += result.count;
    const padded = step.name.padEnd(25);
    console.log(`✓ ${padded} eliminados: ${result.count}`);
  }

  console.log('');
  console.log(`→ Total de registros eliminados: ${total}`);
  console.log('→ Preservados: user, membership, company, tenant');
}

main()
  .catch((err) => {
    console.error('✗ Error durante cleanup:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
