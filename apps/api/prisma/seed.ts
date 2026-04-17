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

  // 6. Seed default categories
  const defaultCategories = [
    { name: 'Ventas', type: 'INCOME' as const, color: '#4CAF50', icon: 'shopping-cart' },
    { name: 'Servicios', type: 'INCOME' as const, color: '#2196F3', icon: 'briefcase' },
    { name: 'Otros Ingresos', type: 'INCOME' as const, color: '#9C27B0', icon: 'plus-circle' },
    { name: 'Arriendo', type: 'EXPENSE' as const, color: '#F44336', icon: 'home' },
    { name: 'Sueldos', type: 'EXPENSE' as const, color: '#FF9800', icon: 'users' },
    { name: 'Servicios Básicos', type: 'EXPENSE' as const, color: '#FF5722', icon: 'zap' },
    { name: 'Proveedores', type: 'EXPENSE' as const, color: '#795548', icon: 'truck' },
    { name: 'Impuestos', type: 'EXPENSE' as const, color: '#607D8B', icon: 'file-text' },
    { name: 'Otros Gastos', type: 'EXPENSE' as const, color: '#9E9E9E', icon: 'minus-circle' },
  ];

  for (const cat of defaultCategories) {
    await prisma.category.upsert({
      where: {
        companyId_name_type: {
          companyId: company.id,
          name: cat.name,
          type: cat.type,
        },
      },
      update: {},
      create: {
        companyId: company.id,
        name: cat.name,
        type: cat.type,
        color: cat.color,
        icon: cat.icon,
      },
    });
  }
  console.log(`Categories: ${defaultCategories.length} default categories seeded`);

  // 7. Seed default counterparties
  const defaultCounterparties = [
    { name: 'Banco de Chile', type: 'BANK' as const, taxId: '97.004.000-5' },
    { name: 'SII', type: 'GOVERNMENT' as const, taxId: '60.803.000-K' },
    { name: 'Cliente Demo', type: 'CLIENT' as const, taxId: null },
    { name: 'Proveedor Demo', type: 'SUPPLIER' as const, taxId: null },
  ];

  for (const cp of defaultCounterparties) {
    const existing = await prisma.counterparty.findFirst({
      where: { companyId: company.id, name: cp.name },
    });
    if (!existing) {
      await prisma.counterparty.create({
        data: {
          companyId: company.id,
          name: cp.name,
          type: cp.type,
          taxId: cp.taxId,
        },
      });
    }
  }
  console.log(`Counterparties: ${defaultCounterparties.length} default counterparties seeded`);

  // 8. Seed cost centers
  const defaultCostCenters = [
    { name: 'Administración', code: 'ADM' },
    { name: 'Ventas', code: 'VTA' },
    { name: 'Tecnología', code: 'TI' },
  ];

  for (const cc of defaultCostCenters) {
    await prisma.costCenter.upsert({
      where: { companyId_code: { companyId: company.id, code: cc.code } },
      update: {},
      create: { companyId: company.id, name: cc.name, code: cc.code },
    });
  }
  console.log(`CostCenters: ${defaultCostCenters.length} default cost centers seeded`);

  // 9. Seed fiscal periods for 2026
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
  const year = 2026;
  let periodsCreated = 0;

  for (let month = 1; month <= 12; month++) {
    const existing = await prisma.fiscalPeriod.findFirst({
      where: { companyId: company.id, year, month },
    });
    if (!existing) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
      await prisma.fiscalPeriod.create({
        data: {
          companyId: company.id,
          name: `${MONTHS[month - 1]} ${year}`,
          year,
          month,
          startDate,
          endDate,
        },
      });
      periodsCreated++;
    }
  }
  console.log(`FiscalPeriods: ${periodsCreated} periods seeded for ${year}`);

  // 10. Seed sample movements for April 2026
  const aprilPeriod = await prisma.fiscalPeriod.findFirst({
    where: { companyId: company.id, year: 2026, month: 4 },
  });
  const ventas = await prisma.category.findFirst({
    where: { companyId: company.id, name: 'Ventas' },
  });
  const servicios = await prisma.category.findFirst({
    where: { companyId: company.id, name: 'Servicios' },
  });
  const arriendo = await prisma.category.findFirst({
    where: { companyId: company.id, name: 'Arriendo' },
  });
  const sueldos = await prisma.category.findFirst({
    where: { companyId: company.id, name: 'Sueldos' },
  });
  const clienteDemo = await prisma.counterparty.findFirst({
    where: { companyId: company.id, name: 'Cliente Demo' },
  });
  const proveedorDemo = await prisma.counterparty.findFirst({
    where: { companyId: company.id, name: 'Proveedor Demo' },
  });

  if (aprilPeriod && ventas && servicios && arriendo && sueldos) {
    const existingMovements = await prisma.movement.count({
      where: { companyId: company.id },
    });

    if (existingMovements === 0) {
      const sampleMovements = [
        {
          type: 'INCOME' as const,
          status: 'CONFIRMED' as const,
          categoryId: ventas.id,
          counterpartyId: clienteDemo?.id,
          amount: 5000000,
          date: new Date('2026-04-05'),
          description: 'Factura venta productos abril',
          reference: 'FAC-001',
          confirmedAt: new Date(),
          confirmedBy: user.id,
        },
        {
          type: 'INCOME' as const,
          status: 'CONFIRMED' as const,
          categoryId: servicios.id,
          amount: 2500000,
          date: new Date('2026-04-10'),
          description: 'Servicios de consultoría',
          reference: 'FAC-002',
          confirmedAt: new Date(),
          confirmedBy: user.id,
        },
        {
          type: 'EXPENSE' as const,
          status: 'CONFIRMED' as const,
          categoryId: arriendo.id,
          counterpartyId: proveedorDemo?.id,
          amount: 1200000,
          date: new Date('2026-04-01'),
          description: 'Arriendo oficina abril',
          reference: 'BOL-001',
          confirmedAt: new Date(),
          confirmedBy: user.id,
        },
        {
          type: 'EXPENSE' as const,
          status: 'CONFIRMED' as const,
          categoryId: sueldos.id,
          amount: 3500000,
          date: new Date('2026-04-30'),
          description: 'Sueldos equipo abril',
          reference: 'NOM-APR',
          confirmedAt: new Date(),
          confirmedBy: user.id,
        },
        {
          type: 'EXPENSE' as const,
          status: 'DRAFT' as const,
          categoryId: arriendo.id,
          amount: 150000,
          date: new Date('2026-04-15'),
          description: 'Gastos oficina pendiente revisión',
        },
      ];

      for (const mov of sampleMovements) {
        await prisma.movement.create({
          data: {
            companyId: company.id,
            fiscalPeriodId: aprilPeriod.id,
            createdBy: user.id,
            ...mov,
          },
        });
      }
      console.log(`Movements: ${sampleMovements.length} sample movements seeded`);
    } else {
      console.log(`Movements: ${existingMovements} already exist, skipping`);
    }
  }

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
