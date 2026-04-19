import { Injectable } from '@nestjs/common';
import { MovementStatus, Prisma } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../common/prisma/prisma.service';

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: '1F4E79' },
};
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFF' }, size: 11 };
const INCOME_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'E8F5E9' },
};
const EXPENSE_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFEBEE' },
};

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async exportMovementsExcel(
    companyId: string,
    filters: {
      fiscalPeriodId?: string;
      type?: string;
      status?: string;
      dateFrom?: string;
      dateTo?: string;
      search?: string;
    },
  ): Promise<Buffer> {
    const where: Prisma.MovementWhereInput = { companyId };
    if (filters.fiscalPeriodId) where.fiscalPeriodId = filters.fiscalPeriodId;
    if (filters.type) where.type = filters.type as Prisma.EnumMovementTypeFilter;
    if (filters.status) where.status = filters.status as Prisma.EnumMovementStatusFilter;
    if (filters.dateFrom || filters.dateTo) {
      where.date = {};
      if (filters.dateFrom) where.date.gte = new Date(filters.dateFrom);
      if (filters.dateTo) where.date.lte = new Date(filters.dateTo);
    }
    if (filters.search) {
      where.OR = [
        { description: { contains: filters.search, mode: 'insensitive' } },
        { reference: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const movements = await this.prisma.movement.findMany({
      where,
      include: {
        category: { select: { name: true } },
        counterparty: { select: { name: true } },
        costCenter: { select: { name: true } },
        fiscalPeriod: { select: { name: true } },
      },
      orderBy: { date: 'desc' },
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Excelsia ERP';
    wb.created = new Date();

    // Sheet 1 — Movimientos
    const ws = wb.addWorksheet('Movimientos');
    ws.columns = [
      { header: 'Fecha', key: 'date', width: 14 },
      { header: 'Tipo', key: 'type', width: 10 },
      { header: 'Estado', key: 'status', width: 12 },
      { header: 'Descripción', key: 'description', width: 35 },
      { header: 'Categoría', key: 'category', width: 18 },
      { header: 'Contraparte', key: 'counterparty', width: 20 },
      { header: 'Centro de Costo', key: 'costCenter', width: 16 },
      { header: 'Referencia', key: 'reference', width: 14 },
      { header: 'Monto', key: 'amount', width: 16 },
      { header: 'Moneda', key: 'currency', width: 8 },
    ];

    ws.getRow(1).eachCell((cell) => {
      cell.fill = HEADER_FILL;
      cell.font = HEADER_FONT;
    });

    for (const m of movements) {
      const row = ws.addRow({
        date: new Date(m.date).toLocaleDateString('es-CL'),
        type: m.type === 'INCOME' ? 'Ingreso' : 'Egreso',
        status: m.status,
        description: m.description,
        category: m.category?.name || '',
        counterparty: m.counterparty?.name || '',
        costCenter: m.costCenter?.name || '',
        reference: m.reference || '',
        amount: Number(m.amount),
        currency: m.currency,
      });
      row.eachCell((cell) => {
        cell.fill = m.type === 'INCOME' ? INCOME_FILL : EXPENSE_FILL;
      });
    }

    // Sheet 2 — Resumen
    const totalIncome = movements
      .filter((m) => m.type === 'INCOME' && m.status === 'CONFIRMED')
      .reduce((s, m) => s + Number(m.amount), 0);
    const totalExpense = movements
      .filter((m) => m.type === 'EXPENSE' && m.status === 'CONFIRMED')
      .reduce((s, m) => s + Number(m.amount), 0);

    const summary = wb.addWorksheet('Resumen');
    summary.columns = [
      { header: 'Concepto', key: 'label', width: 25 },
      { header: 'Valor', key: 'value', width: 20 },
    ];
    summary.getRow(1).eachCell((cell) => {
      cell.fill = HEADER_FILL;
      cell.font = HEADER_FONT;
    });
    summary.addRow({ label: 'Total Ingresos', value: totalIncome });
    summary.addRow({ label: 'Total Egresos', value: totalExpense });
    summary.addRow({ label: 'Balance', value: totalIncome - totalExpense });
    summary.addRow({ label: 'Total Movimientos', value: movements.length });
    summary.addRow({ label: 'Fecha Exportación', value: new Date().toLocaleString('es-CL') });

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async exportCashflowExcel(companyId: string, fiscalPeriodId: string): Promise<Buffer> {
    const [balances, commitments, accounts] = await Promise.all([
      this.prisma.accountBalance.findMany({
        where: { companyId, fiscalPeriodId },
        include: { bankAccount: { select: { name: true, type: true, bankName: true } } },
      }),
      this.prisma.commitment.findMany({
        where: { companyId, fiscalPeriodId },
        include: { counterparty: { select: { name: true } }, category: { select: { name: true } } },
        orderBy: { dueDate: 'asc' },
      }),
      this.prisma.bankAccount.findMany({ where: { companyId, isActive: true } }),
    ]);

    const [incomeAgg, expenseAgg] = await Promise.all([
      this.prisma.movement.aggregate({
        where: { companyId, fiscalPeriodId, type: 'INCOME', status: MovementStatus.CONFIRMED },
        _sum: { amount: true },
      }),
      this.prisma.movement.aggregate({
        where: { companyId, fiscalPeriodId, type: 'EXPENSE', status: MovementStatus.CONFIRMED },
        _sum: { amount: true },
      }),
    ]);

    const opening = balances.reduce((s, b) => s + Number(b.openingBalance), 0);
    const totalIncome = Number(incomeAgg._sum.amount || 0);
    const totalExpense = Number(expenseAgg._sum.amount || 0);
    const totalCash = opening + totalIncome - totalExpense;
    const committed = commitments
      .filter((c) => c.status === 'PENDING')
      .reduce((s, c) => s + Number(c.amount), 0);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Excelsia ERP';

    // Sheet 1 — Posición
    const ws1 = wb.addWorksheet('Posición de Caja');
    ws1.columns = [
      { header: 'Concepto', key: 'label', width: 25 },
      { header: 'Monto', key: 'value', width: 20 },
    ];
    ws1.getRow(1).eachCell((cell) => {
      cell.fill = HEADER_FILL;
      cell.font = HEADER_FONT;
    });
    ws1.addRow({ label: 'Saldo Apertura', value: opening });
    ws1.addRow({ label: 'Ingresos Confirmados', value: totalIncome });
    ws1.addRow({ label: 'Egresos Confirmados', value: totalExpense });
    ws1.addRow({ label: 'Caja Total', value: totalCash });
    ws1.addRow({ label: 'Comprometido', value: committed });
    ws1.addRow({ label: 'Caja Libre', value: totalCash - committed });

    // Sheet 2 — Compromisos
    const ws2 = wb.addWorksheet('Compromisos');
    ws2.columns = [
      { header: 'Vencimiento', key: 'dueDate', width: 14 },
      { header: 'Descripción', key: 'description', width: 30 },
      { header: 'Tipo', key: 'type', width: 10 },
      { header: 'Monto', key: 'amount', width: 16 },
      { header: 'Estado', key: 'status', width: 12 },
      { header: 'Contraparte', key: 'counterparty', width: 20 },
    ];
    ws2.getRow(1).eachCell((cell) => {
      cell.fill = HEADER_FILL;
      cell.font = HEADER_FONT;
    });
    for (const c of commitments) {
      ws2.addRow({
        dueDate: new Date(c.dueDate).toLocaleDateString('es-CL'),
        description: c.description,
        type: c.type === 'INCOME' ? 'Ingreso' : 'Egreso',
        amount: Number(c.amount),
        status: c.status,
        counterparty: c.counterparty?.name || '',
      });
    }

    // Sheet 3 — Cuentas
    const ws3 = wb.addWorksheet('Cuentas Bancarias');
    ws3.columns = [
      { header: 'Cuenta', key: 'name', width: 30 },
      { header: 'Tipo', key: 'type', width: 16 },
      { header: 'Banco', key: 'bank', width: 20 },
      { header: 'Saldo Apertura', key: 'balance', width: 16 },
    ];
    ws3.getRow(1).eachCell((cell) => {
      cell.fill = HEADER_FILL;
      cell.font = HEADER_FONT;
    });
    for (const acc of accounts) {
      const bal = balances.find((b) => b.bankAccountId === acc.id);
      ws3.addRow({
        name: acc.name,
        type: acc.type,
        bank: acc.bankName || '',
        balance: bal ? Number(bal.openingBalance) : 0,
      });
    }

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async generateExecutiveSummary(companyId: string, fiscalPeriodId?: string) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });

    let period;
    if (fiscalPeriodId) {
      period = await this.prisma.fiscalPeriod.findFirst({
        where: { id: fiscalPeriodId, companyId },
      });
    } else {
      const now = new Date();
      period = await this.prisma.fiscalPeriod.findFirst({
        where: { companyId, year: now.getFullYear(), month: now.getMonth() + 1 },
      });
    }
    const pId = period?.id;

    const [incomeAgg, expenseAgg, movementCount, balances, commitmentAgg, alerts, topCategories] =
      await Promise.all([
        pId
          ? this.prisma.movement.aggregate({
              where: {
                companyId,
                fiscalPeriodId: pId,
                type: 'INCOME',
                status: MovementStatus.CONFIRMED,
              },
              _sum: { amount: true },
            })
          : Promise.resolve({ _sum: { amount: null } }),
        pId
          ? this.prisma.movement.aggregate({
              where: {
                companyId,
                fiscalPeriodId: pId,
                type: 'EXPENSE',
                status: MovementStatus.CONFIRMED,
              },
              _sum: { amount: true },
            })
          : Promise.resolve({ _sum: { amount: null } }),
        pId
          ? this.prisma.movement.count({
              where: { companyId, fiscalPeriodId: pId, status: MovementStatus.CONFIRMED },
            })
          : Promise.resolve(0),
        pId
          ? this.prisma.accountBalance.findMany({ where: { companyId, fiscalPeriodId: pId } })
          : Promise.resolve([]),
        this.prisma.commitment.aggregate({
          where: { companyId, status: 'PENDING' },
          _sum: { amount: true },
          _count: true,
        }),
        Promise.all([
          this.prisma.alert.count({ where: { companyId, status: 'ACTIVE', severity: 'CRITICAL' } }),
          this.prisma.alert.count({ where: { companyId, status: 'ACTIVE', severity: 'WARNING' } }),
          this.prisma.alert.count({ where: { companyId, status: 'ACTIVE', severity: 'INFO' } }),
        ]),
        pId
          ? this.prisma.movement.groupBy({
              by: ['categoryId'],
              where: {
                companyId,
                fiscalPeriodId: pId,
                type: 'EXPENSE',
                status: MovementStatus.CONFIRMED,
              },
              _sum: { amount: true },
              orderBy: { _sum: { amount: 'desc' } },
              take: 5,
            })
          : Promise.resolve([]),
      ]);

    const income = Number(incomeAgg._sum.amount || 0);
    const expense = Number(expenseAgg._sum.amount || 0);
    const opening = balances.reduce((s, b) => s + Number(b.openingBalance), 0);
    const totalCash = opening + income - expense;
    const committed = Number(commitmentAgg._sum.amount || 0);

    const catIds = topCategories.map((c) => c.categoryId);
    const cats =
      catIds.length > 0
        ? await this.prisma.category.findMany({
            where: { id: { in: catIds } },
            select: { id: true, name: true },
          })
        : [];
    const catMap = new Map(cats.map((c) => [c.id, c.name]));

    return {
      company: { name: company?.name, taxId: company?.taxId, period: period?.name },
      cash: { total: totalCash, free: totalCash - committed, committed, opening },
      movements: { income, expense, balance: income - expense, count: movementCount },
      topCategories: topCategories.map((g) => ({
        name: catMap.get(g.categoryId) || 'Unknown',
        total: Number(g._sum.amount || 0),
        percentage: expense > 0 ? Math.round((Number(g._sum.amount || 0) / expense) * 100) : 0,
      })),
      commitments: { total: commitmentAgg._count, totalAmount: committed },
      alerts: { critical: alerts[0], warning: alerts[1], info: alerts[2] },
      generatedAt: new Date().toISOString(),
    };
  }
}
