import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const NOW = new Date();
const CURRENT_YEAR = NOW.getFullYear();
const YEARS_TO_SEED = [CURRENT_YEAR, CURRENT_YEAR + 1];

async function ensureSettings(companyId: string) {
  await prisma.companySettings.upsert({
    where: { companyId },
    update: {},
    create: { companyId },
  });
}

async function createPeriod(companyId: string, userId: string, year: number, month: number) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);
  const name = `${MONTHS[month - 1]} ${year}`;

  await prisma.$transaction(async (tx) => {
    // Session context so RLS + audit triggers fire correctly.
    await tx.$executeRawUnsafe(`SET LOCAL rls.company_id = '${companyId}'`);
    await tx.$executeRawUnsafe(`SET LOCAL audit.company_id = '${companyId}'`);
    await tx.$executeRawUnsafe(`SET LOCAL audit.user_id = '${userId}'`);
    await tx.fiscalPeriod.create({
      data: { companyId, name, year, month, startDate, endDate },
    });
  });
}

async function main() {
  console.log('→ Restaurando períodos fiscales...');
  console.log(`  Años: ${YEARS_TO_SEED.join(', ')}`);
  console.log('');

  const companies = await prisma.company.findMany({
    include: {
      memberships: {
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
    },
  });

  if (companies.length === 0) {
    console.log('No hay empresas en la BD. Corre el seed primero.');
    return;
  }

  let totalCreated = 0;
  let totalSkipped = 0;

  for (const company of companies) {
    const actor = company.memberships[0];
    if (!actor) {
      console.log(`⚠ ${company.name}: sin miembros activos, se omite`);
      continue;
    }

    console.log(`→ ${company.name} (${company.id})`);
    await ensureSettings(company.id);

    for (const year of YEARS_TO_SEED) {
      for (let month = 1; month <= 12; month++) {
        const existing = await prisma.fiscalPeriod.findFirst({
          where: { companyId: company.id, year, month },
        });
        if (existing) {
          totalSkipped++;
          continue;
        }
        await createPeriod(company.id, actor.userId, year, month);
        totalCreated++;
      }
      console.log(`  ✓ ${year}: 12 meses listos`);
    }
  }

  console.log('');
  console.log(`→ Períodos creados: ${totalCreated}`);
  console.log(`→ Ya existían: ${totalSkipped}`);
}

main()
  .catch((err) => {
    console.error('✗ Error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
