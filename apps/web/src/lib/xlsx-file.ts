'use client';

import { CANONICAL_HEADERS, type SourceRow } from './product-import';

/**
 * Excel dosyası okuma/yazma — exceljs YALNIZ burada ve DİNAMİK import edilir,
 * import sihirbazı açılana kadar ana pakete girmesin (~1 MB tarayıcı derlemesi).
 */

interface WorkbookLike {
  xlsx: {
    load: (data: ArrayBuffer) => Promise<unknown>;
    writeBuffer: () => Promise<ArrayBuffer>;
  };
  worksheets: WorksheetLike[];
  addWorksheet: (name: string) => WorksheetLike;
}

interface CellLike {
  value: unknown;
}

interface RowLike {
  getCell: (index: number) => CellLike;
  commit: () => void;
}

interface WorksheetLike {
  columnCount: number;
  getRow: (index: number) => RowLike;
  eachRow: (callback: (row: RowLike, rowNumber: number) => void) => void;
}

interface ExcelModule {
  Workbook: new () => WorkbookLike;
}

async function loadExcel(): Promise<ExcelModule> {
  // exceljs UMD/CJS: paketleyicinin interop'una göre ya doğrudan ya `default` altında gelir.
  const imported: unknown = await import('exceljs');
  const candidate = imported as { default?: ExcelModule } & Partial<ExcelModule>;
  const resolved = candidate.default ?? (candidate as ExcelModule);
  if (typeof resolved.Workbook !== 'function') {
    throw new Error('Excel kütüphanesi yüklenemedi.');
  }
  return resolved;
}

/** Hücre değerini metne indirger — formül/hyperlink nesneleri de dahil (backend ile aynı kural). */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const inner =
      (value as { result?: unknown; text?: unknown }).result ?? (value as { text?: unknown }).text;
    if (typeof inner === 'string' || typeof inner === 'number') return String(inner).trim();
  }
  return '';
}

export interface ParsedSheet {
  headers: string[];
  rows: SourceRow[];
}

/**
 * İlk sayfayı okur: 1. satır başlık, kalanı veri. Satır numaraları KAYNAK dosyadaki
 * numaralardır — sunucunun hata raporu aynı numarayı gösterir.
 */
export async function readProductSheet(file: File): Promise<ParsedSheet> {
  const excel = await loadExcel();
  const workbook = new excel.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('Excel dosyasında sayfa bulunamadı.');

  const width = Math.max(sheet.columnCount, CANONICAL_HEADERS.length);
  const headerRow = sheet.getRow(1);
  const headers = Array.from({ length: width }, (_, i) => cellText(headerRow.getCell(i + 1).value));

  const rows: SourceRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const cells = Array.from({ length: width }, (_, i) => cellText(row.getCell(i + 1).value));
    // Tamamen boş satır atlanır (Excel dosyalarında sık).
    if (cells.every((cellValue) => cellValue === '')) return;
    rows.push({ row: rowNumber, cells });
  });

  return { headers, rows };
}

/**
 * Kanonik düzende yeni bir .xlsx üretir. Satırlar KAYNAK satır numaralarına yazılır;
 * aradaki boşluklar korunur, böylece sunucunun raporladığı satır kullanıcının
 * dosyasındaki satırla birebir aynı olur.
 */
export async function buildCanonicalWorkbook(
  rows: readonly { row: number; cells: string[] }[],
  fileName: string,
): Promise<File> {
  const excel = await loadExcel();
  const workbook = new excel.Workbook();
  const sheet = workbook.addWorksheet('Ürünler');

  const header = sheet.getRow(1);
  CANONICAL_HEADERS.forEach((label, index) => {
    header.getCell(index + 1).value = label;
  });
  header.commit();

  for (const row of rows) {
    const target = sheet.getRow(row.row);
    row.cells.forEach((value, index) => {
      target.getCell(index + 1).value = value;
    });
    target.commit();
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new File([buffer], fileName, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
