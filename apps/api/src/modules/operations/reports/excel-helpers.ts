import * as ExcelJS from 'exceljs';

/* OPS-031 — shared Excel formatting primitives. Mirrors the corporate
   palette used by Finance's reports.service (REP-001) so the two
   modules feel like one product. Imported by every generator under
   apps/api/src/modules/operations/reports/generators/. */

const HEX_BLUE = '1E3A5F';
const HEX_WHITE = 'FFFFFF';

const HEX_GREEN_BG = 'D1FAE5';
const HEX_GREEN_FG = '065F46';
const HEX_YELLOW_BG = 'FEF3C7';
const HEX_YELLOW_FG = '92400E';
const HEX_RED_BG = 'FEE2E2';
const HEX_RED_FG = '991B1B';

export const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: HEX_BLUE },
};
export const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: HEX_WHITE },
  size: 11,
};
export const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'CCCCCC' } },
  bottom: { style: 'thin', color: { argb: 'CCCCCC' } },
  left: { style: 'thin', color: { argb: 'CCCCCC' } },
  right: { style: 'thin', color: { argb: 'CCCCCC' } },
};

/* Apply the corporate header style to a row. We reach for the row by
   number rather than relying on `worksheet.lastRow` so the helper
   remains usable mid-build (e.g., before any data has been added). */
export function applyHeaderStyle(worksheet: ExcelJS.Worksheet, rowNumber: number): void {
  const row = worksheet.getRow(rowNumber);
  row.eachCell({ includeEmpty: false }, (cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = THIN_BORDER;
  });
  row.height = 22;
}

export type ComplianceTone = 'green' | 'yellow' | 'red';

/* Pick a tone from a percentage on the same threshold scale used by
   the dashboard (>=90 green, 70-90 yellow, <70 red). */
export function compliancePctTone(pct: number): ComplianceTone {
  if (pct >= 90) return 'green';
  if (pct >= 70) return 'yellow';
  return 'red';
}

const TONE_PALETTE: Record<ComplianceTone, { bg: string; fg: string }> = {
  green: { bg: HEX_GREEN_BG, fg: HEX_GREEN_FG },
  yellow: { bg: HEX_YELLOW_BG, fg: HEX_YELLOW_FG },
  red: { bg: HEX_RED_BG, fg: HEX_RED_FG },
};

export function applyConditionalColor(cell: ExcelJS.Cell, tone: ComplianceTone): void {
  const palette = TONE_PALETTE[tone];
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: palette.bg },
  };
  cell.font = { bold: true, color: { argb: palette.fg } };
}

/* Section banner — used at the top of summary sheets so a workbook
   opens with a clear "this is what you're looking at" headline. The
   row is merged across the first N columns and styled to match the
   header palette. */
export function addCompanyHeader(
  worksheet: ExcelJS.Worksheet,
  options: {
    company: { name: string | null; taxId?: string | null };
    reportTitle: string;
    dateRange?: { from: string; to: string };
    columns: number;
  },
): number {
  const { company, reportTitle, dateRange, columns } = options;
  const titleRow = worksheet.addRow([`${reportTitle} — ${company.name ?? '—'}`]);
  worksheet.mergeCells(titleRow.number, 1, titleRow.number, columns);
  const titleCell = titleRow.getCell(1);
  titleCell.font = { bold: true, color: { argb: HEX_WHITE }, size: 14 };
  titleCell.fill = HEADER_FILL;
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  titleRow.height = 28;

  const subtitleParts: string[] = [];
  if (company.taxId) subtitleParts.push(`RUT ${company.taxId}`);
  if (dateRange) subtitleParts.push(`Período ${dateRange.from} → ${dateRange.to}`);
  subtitleParts.push(`Generado ${new Date().toLocaleString('es-CL')}`);
  const subRow = worksheet.addRow([subtitleParts.join('  ·  ')]);
  worksheet.mergeCells(subRow.number, 1, subRow.number, columns);
  const subCell = subRow.getCell(1);
  subCell.font = { italic: true, color: { argb: '475569' }, size: 10 };
  subCell.alignment = { vertical: 'middle', horizontal: 'left' };

  /* Spacer row so the data table doesn't crash into the title. */
  worksheet.addRow([]);
  return subRow.number + 2;
}

/* Footer — single-line generation metadata appended at the bottom of
   a sheet. Keeps audit trail visible even when someone copies a
   single sheet out of the workbook. */
export function addCompanyFooter(
  worksheet: ExcelJS.Worksheet,
  options: { generatedAt: Date; generatedBy?: string | null; columns: number },
): void {
  worksheet.addRow([]);
  const parts = [`Generado ${options.generatedAt.toLocaleString('es-CL')}`];
  if (options.generatedBy) parts.push(`por ${options.generatedBy}`);
  parts.push('Excelsia ERP — Operaciones');
  const row = worksheet.addRow([parts.join('  ·  ')]);
  worksheet.mergeCells(row.number, 1, row.number, options.columns);
  const cell = row.getCell(1);
  cell.font = { italic: true, color: { argb: '94A3B8' }, size: 9 };
  cell.alignment = { vertical: 'middle', horizontal: 'right' };
}

/* Convenience — apply a date format to every cell in a column.
   ExcelJS uses Excel's quirky format strings here. */
export function formatDateColumn(worksheet: ExcelJS.Worksheet, columnLetter: string): void {
  worksheet.getColumn(columnLetter).numFmt = 'dd-mm-yyyy';
}

export function formatNumberColumn(
  worksheet: ExcelJS.Worksheet,
  columnLetter: string,
  format = '#,##0',
): void {
  worksheet.getColumn(columnLetter).numFmt = format;
}

export function formatPercentColumn(worksheet: ExcelJS.Worksheet, columnLetter: string): void {
  worksheet.getColumn(columnLetter).numFmt = '0.0"%"';
}

export function freezeHeader(worksheet: ExcelJS.Worksheet, rowsAbove: number): void {
  worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: rowsAbove }];
}

export function autoSizeColumns(worksheet: ExcelJS.Worksheet, padding = 2): void {
  worksheet.columns.forEach((col) => {
    let max = (col.header as string)?.length ?? 0;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const value = cell.value;
      let str = '';
      if (value instanceof Date) str = value.toLocaleDateString('es-CL');
      else if (typeof value === 'number') str = String(value);
      else if (typeof value === 'string') str = value;
      else if (value && typeof value === 'object' && 'text' in value) {
        str = String((value as { text?: unknown }).text ?? '');
      }
      max = Math.max(max, str.length);
    });
    col.width = Math.min(60, Math.max(10, max + padding));
  });
}

/* Common workbook bootstrapping — every generator starts the same
   way so we centralize the metadata defaults. */
export function newWorkbook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Excelsia ERP';
  wb.lastModifiedBy = 'Excelsia ERP';
  wb.created = new Date();
  wb.modified = new Date();
  return wb;
}
