import * as ExcelJS from 'exceljs';
import { ReportsService } from './reports.service';
import { PrismaService } from '../common/prisma/prisma.service';

describe('FIN-A movement export', () => {
  it('writes RUT and Giro directly after Contraparte, with empty cells for unknown facts', async () => {
    const movement = {
      date: new Date('2026-09-15'),
      type: 'EXPENSE',
      status: 'CONFIRMED',
      description: 'Factura',
      amount: 11900,
      currency: 'CLP',
      category: { name: 'Servicios' },
      reference: '33-1',
      costCenter: null,
      fiscalPeriod: { name: 'Septiembre 2026' },
    };
    const findMany = jest.fn().mockResolvedValue([
      {
        ...movement,
        counterparty: { name: 'Horizonte Ltda.', taxId: '12.345.678-5', giro: 'Construcción' },
      },
      { ...movement, counterparty: null },
      { ...movement, counterparty: { name: 'Sin giro', taxId: '11.111.111-1', giro: null } },
    ]);
    const service = new ReportsService({ movement: { findMany } } as unknown as PrismaService);
    const buffer = await service.exportMovementsExcel('company-a', { status: 'CONFIRMED' });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
    const ws = wb.getWorksheet('Movimientos');
    if (!ws) throw new Error('Missing movements worksheet');
    expect(ws.getRow(1).values).toEqual([
      undefined,
      'Fecha',
      'Tipo',
      'Estado',
      'Descripción',
      'Categoría',
      'Contraparte',
      'RUT',
      'Giro',
      'Centro de Costo',
      'Referencia',
      'Monto',
      'Moneda',
    ]);
    expect(ws.getCell('G2').text).toBe('12.345.678-5');
    expect(ws.getCell('H2').text).toBe('Construcción');
    expect(ws.getCell('G3').text).toBe('');
    expect(ws.getCell('H3').text).toBe('');
    expect(ws.getCell('H4').text).toBe('');
    expect(ws.getCell('K2').value).toBe(11900);
    expect(wb.getWorksheet('Resumen')?.getCell('B3').value).toBe(35700);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 'company-a', status: 'CONFIRMED' },
        include: expect.objectContaining({
          counterparty: { select: { name: true, taxId: true, giro: true } },
        }),
      }),
    );
  });
});
