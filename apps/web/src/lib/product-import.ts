/**
 * Excel ürün import'unun istemci tarafı mantığı — SAF fonksiyonlar, doğrudan test edilir.
 *
 * Backend sabit sütun düzeni bekler: 1 Ad · 2 Kod · 3 Birim · 4 Satış Fiyatı · 5 KDV · 6 Barkod
 * (`ProductImportService.parse`). Sihirbaz kullanıcının dosyasındaki sütunları bu düzene
 * EŞLER ve dosyayı kanonik düzende yeniden kurar; böylece esnaf sütunlarını elle taşımaz.
 *
 * Satır numaraları kaynak dosyadaki numaralarla AYNI tutulur (yeniden kurarken de),
 * yoksa sunucunun raporladığı "3. satır hatalı" kullanıcının gördüğü satırı göstermez.
 */

export type ImportFieldKey = 'name' | 'code' | 'unit' | 'salePrice' | 'vatRate' | 'barcode';

export interface ImportField {
  key: ImportFieldKey;
  label: string;
  required: boolean;
  /** Backend'in beklediği sütun sırası (1 tabanlı). */
  column: number;
  /** Başlık otomatik eşlemesinde aranan adlar. */
  aliases: readonly string[];
}

export const IMPORT_FIELDS: readonly ImportField[] = [
  {
    key: 'name',
    label: 'Ürün adı',
    required: true,
    column: 1,
    aliases: ['ad', 'adi', 'urun', 'urunadi', 'isim', 'name', 'product', 'productname'],
  },
  {
    key: 'code',
    label: 'Stok kodu',
    required: false,
    column: 2,
    aliases: ['kod', 'stokkodu', 'code', 'sku'],
  },
  {
    key: 'unit',
    label: 'Birim',
    required: true,
    column: 3,
    aliases: ['birim', 'unit', 'olcu', 'olcubirimi'],
  },
  {
    key: 'salePrice',
    label: 'Satış fiyatı',
    required: true,
    column: 4,
    aliases: ['satisfiyati', 'fiyat', 'satis', 'price', 'saleprice', 'tutar'],
  },
  {
    key: 'vatRate',
    label: 'KDV oranı',
    required: true,
    column: 5,
    aliases: ['kdv', 'kdvorani', 'vat', 'vatrate', 'tax'],
  },
  {
    key: 'barcode',
    label: 'Barkod',
    required: false,
    column: 6,
    aliases: ['barkod', 'barcode', 'ean', 'ean13'],
  },
];

/** Sütun eşlemesi: alan → kaynak dosyadaki sütun indeksi (0 tabanlı). -1 = eşlenmedi. */
export type ColumnMapping = Record<ImportFieldKey, number>;

export const EMPTY_MAPPING: ColumnMapping = {
  name: -1,
  code: -1,
  unit: -1,
  salePrice: -1,
  vatRate: -1,
  barcode: -1,
};

/** Türkçe duyarlı normalize: "Satış Fiyatı" → "satisfiyati". */
function normalizeHeader(value: string): string {
  return value
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, '');
}

/** Başlık satırından otomatik eşleme önerisi; bulunamayan alan -1 kalır. */
export function guessMapping(headers: readonly string[]): ColumnMapping {
  const normalized = headers.map(normalizeHeader);
  const mapping: ColumnMapping = { ...EMPTY_MAPPING };
  const used = new Set<number>();

  for (const field of IMPORT_FIELDS) {
    const index = normalized.findIndex(
      (header, i) => header !== '' && !used.has(i) && field.aliases.includes(header),
    );
    if (index !== -1) {
      mapping[field.key] = index;
      used.add(index);
    }
  }
  return mapping;
}

/** Zorunlu alanların hepsi eşlendi mi. */
export function isMappingComplete(mapping: ColumnMapping): boolean {
  return IMPORT_FIELDS.every((field) => !field.required || mapping[field.key] !== -1);
}

/** Aynı kaynak sütunu iki alana veren eşleme geçersizdir. */
export function duplicateMappedColumns(mapping: ColumnMapping): number[] {
  const counts = new Map<number, number>();
  for (const field of IMPORT_FIELDS) {
    const index = mapping[field.key];
    if (index === -1) continue;
    counts.set(index, (counts.get(index) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([index]) => index);
}

export interface SourceRow {
  /** Kaynak dosyadaki satır numarası (başlık = 1). */
  row: number;
  cells: string[];
}

export interface MappedRow {
  row: number;
  name: string;
  code: string;
  unit: string;
  salePrice: string;
  vatRate: string;
  barcode: string;
  /** Bu satırdaki doğrulama hataları; boşsa satır sağlam. */
  errors: RowIssue[];
}

export interface RowIssue {
  field: ImportFieldKey;
  message: string;
}

const PRICE_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

function cell(row: SourceRow, index: number): string {
  return index === -1 ? '' : (row.cells[index] ?? '').trim();
}

/**
 * Satırları eşlemeye göre okur ve backend'in uygulayacağı kuralları ÖNDEN doğrular:
 * fiyat biçimi, KDV tam sayı 0–100, birim kataloğda var mı, barkod dosya içinde tekrar ediyor mu.
 * Böylece hatalı satır sunucuya gitmeden, satır numarasıyla birlikte görünür.
 */
export function mapRows(
  rows: readonly SourceRow[],
  mapping: ColumnMapping,
  knownUnits: readonly string[],
): MappedRow[] {
  const seenBarcodes = new Map<string, number>();
  const units = new Set(knownUnits);

  return rows.map((source) => {
    const name = cell(source, mapping.name);
    const unit = cell(source, mapping.unit);
    const salePriceRaw = cell(source, mapping.salePrice).replace(',', '.');
    const vatRaw = cell(source, mapping.vatRate);
    const barcode = cell(source, mapping.barcode);
    const errors: RowIssue[] = [];

    if (!name) errors.push({ field: 'name', message: 'Ürün adı boş.' });
    if (!unit) errors.push({ field: 'unit', message: 'Birim boş.' });
    else if (units.size > 0 && !units.has(unit)) {
      errors.push({ field: 'unit', message: `Birim bulunamadı: ${unit}` });
    }

    if (!PRICE_PATTERN.test(salePriceRaw)) {
      errors.push({ field: 'salePrice', message: 'Geçersiz satış fiyatı.' });
    }

    const vatRate = Number.parseFloat(vatRaw);
    if (!Number.isInteger(vatRate) || vatRate < 0 || vatRate > 100) {
      errors.push({ field: 'vatRate', message: 'Geçersiz KDV oranı.' });
    }

    if (barcode) {
      const previous = seenBarcodes.get(barcode);
      if (previous !== undefined) {
        errors.push({ field: 'barcode', message: `Barkod ${String(previous)}. satırda da var.` });
      } else {
        seenBarcodes.set(barcode, source.row);
      }
    }

    return {
      row: source.row,
      name,
      code: cell(source, mapping.code),
      unit,
      salePrice: salePriceRaw,
      vatRate: vatRaw,
      barcode,
      errors,
    };
  });
}

/**
 * Kanonik sütun düzenine çevrilmiş satırlar — yüklenecek dosya bundan kurulur.
 * Hatalı satırlar da GÖNDERİLİR: backend satır satır işler, sağlamlar oluşur,
 * hatalılar rapora düşer (kısmi başarı) ve satır numaraları kaymaz.
 */
export function toCanonicalRows(rows: readonly MappedRow[]): { row: number; cells: string[] }[] {
  return rows.map((row) => ({
    row: row.row,
    cells: [row.name, row.code, row.unit, row.salePrice, row.vatRate, row.barcode],
  }));
}

/** Yüklenecek dosyanın başlık satırı — backend başlığı atlar, sıra önemlidir. */
export const CANONICAL_HEADERS: readonly string[] = IMPORT_FIELDS.map((field) => field.label);

export interface ReportRow {
  row: number;
  message: string;
  field?: string | undefined;
  /** Kaynak satırdaki ürün adı — hatayı dosyada bulmayı kolaylaştırır. */
  name?: string | undefined;
}

/** Excel Türkçe yerelde `;` ayırıcı bekler; BOM olmadan ş/ğ/İ bozulur. */
export function errorsToCsv(rows: readonly ReportRow[]): string {
  const escape = (value: string): string => `"${value.replace(/"/g, '""')}"`;
  const lines = [['Satır', 'Ürün', 'Alan', 'Hata'].map(escape).join(';')];
  for (const row of rows) {
    lines.push(
      [String(row.row), row.name ?? '', row.field ?? '', row.message].map(escape).join(';'),
    );
  }
  // \uFEFF = BOM; kaçış dizisiyle yazılır, kaynakta görünmez karakter bırakmaz.
  return `\uFEFF${lines.join('\r\n')}`;
}
