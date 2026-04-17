import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // 1. Upsert test tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'test-tenant' },
    update: {},
    create: {
      name: 'Test Tenant',
      slug: 'test-tenant',
    },
  });
  console.log(`Tenant: ${tenant.name} (${tenant.id})`);

  // 2. Upsert test company
  let company = await prisma.company.findFirst({
    where: { tenantId: tenant.id, taxId: '76.123.456-7' },
  });
  if (!company) {
    company = await prisma.company.create({
      data: {
        tenantId: tenant.id,
        name: 'Empresa Demo',
        taxId: '76.123.456-7',
        legalName: 'Empresa Demo SpA',
      },
    });
  }
  console.log(`Company: ${company.name} (${company.id})`);

  // 3. Upsert test user
  const passwordHash = await bcrypt.hash('Admin1234!', 10);
  const user = await prisma.user.upsert({
    where: { email: 'admin@excelsia.dev' },
    update: {},
    create: {
      email: 'admin@excelsia.dev',
      passwordHash,
      firstName: 'Admin',
      lastName: 'Demo',
    },
  });
  console.log(`User: ${user.email} (${user.id})`);

  // 4. Upsert company settings (Chilean defaults)
  const settings = await prisma.companySettings.upsert({
    where: { companyId: company.id },
    update: {},
    create: { companyId: company.id },
  });
  console.log(
    `CompanySettings: ${settings.defaultCurrency} / ${settings.timezone} (${settings.id})`,
  );

  // 5. Upsert membership
  const membership = await prisma.membership.upsert({
    where: { userId_companyId: { userId: user.id, companyId: company.id } },
    update: {},
    create: {
      userId: user.id,
      companyId: company.id,
      role: 'ADMIN',
    },
  });
  console.log(`Membership: ${membership.role} (${membership.id})`);

  console.log('\nSeed completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
