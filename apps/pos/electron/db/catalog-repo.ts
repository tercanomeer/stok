import type { PosDatabase } from './database';
import type { CatalogProduct } from '../shared/ipc-contracts';

interface ProductRow {
  id: string;
  name: string;
  salePrice: string;
  vatRate: number;
  stockQuantity: string;
  trackStock: number;
  unitId: string;
  barcodes: string | null;
}

/** Barkod listesini tek hücrede taşıyan ayraç — barkodda geçemeyecek bir kontrol karakteri. */
const BARCODE_SEPARATOR = '\u001f';

/**
 * Barkodlar `group_concat` ile TEK sorguda gelir. Ürün başına ikinci bir sorgu
 * atmak 40 sonuçlu bir aramada 41 sorgu demekti; kasiyer her tuş vuruşunda arıyor.
 */
const SELECT_PRODUCT = `
  SELECT p.id, p.name, p.sale_price AS salePrice, p.vat_rate AS vatRate,
         p.stock_quantity AS stockQuantity, p.track_stock AS trackStock,
         p.unit_id AS unitId,
         (SELECT group_concat(b.value, char(31)) FROM product_barcodes b WHERE b.product_id = p.id)
           AS barcodes
    FROM products p`;

function toProduct(row: ProductRow): CatalogProduct {
  return {
    id: row.id,
    name: row.name,
    salePrice: row.salePrice,
    vatRate: row.vatRate,
    stockQuantity: row.stockQuantity,
    trackStock: row.trackStock === 1,
    unitId: row.unitId,
    barcodes: row.barcodes ? row.barcodes.split(BARCODE_SEPARATOR) : [],
  };
}

/**
 * Satış ekranının arama kutusu. Boş sorgu ilk N ürünü verir (grid'in açılış içeriği).
 *
 * Yalnız AKTİF ürünler döner: pasif ürün kasada satılamaz. Barkodu tam eşleşen ürün
 * listenin başına alınır — kasiyer barkodu yazdıysa istediği odur.
 */
export function searchProducts(db: PosDatabase, query: string, limit = 40): CatalogProduct[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    const rows = db
      .prepare(`${SELECT_PRODUCT} WHERE p.is_active = 1 ORDER BY p.name LIMIT ?`)
      .all(limit) as ProductRow[];
    return rows.map(toProduct);
  }

  const rows = db
    .prepare(
      `${SELECT_PRODUCT}
        WHERE p.is_active = 1
          AND (p.name LIKE @like ESCAPE '\\'
               OR EXISTS (SELECT 1 FROM product_barcodes b
                           WHERE b.product_id = p.id AND b.value LIKE @prefix ESCAPE '\\'))
        ORDER BY
          EXISTS (SELECT 1 FROM product_barcodes b
                   WHERE b.product_id = p.id AND b.value = @exact) DESC,
          p.name
        LIMIT @limit`,
    )
    .all({
      like: `%${escapeLike(trimmed)}%`,
      prefix: `${escapeLike(trimmed)}%`,
      exact: trimmed,
      limit,
    }) as ProductRow[];
  return rows.map(toProduct);
}

/** Tam barkod eşleşmesi — okutulan barkodun birinci denemesi. */
export function findByBarcode(db: PosDatabase, barcode: string): CatalogProduct | null {
  const row = db
    .prepare(
      `${SELECT_PRODUCT}
        WHERE p.id = (SELECT b.product_id FROM product_barcodes b WHERE b.value = ? LIMIT 1)`,
    )
    .get(barcode) as ProductRow | undefined;
  return row ? toProduct(row) : null;
}

/**
 * Tartılı barkodun ÜRÜN kısmına göre eşleştirme.
 *
 * Terazi barkodunda son 6 hane her etikette değişir (gömülü değer + kontrol hanesi);
 * ürünün kayıtlı barkoduyla tam eşleşme aramak bu yüzden hiçbir zaman tutmaz.
 * Sabit olan ilk 7 hane (prefix + ürün kodu) karşılaştırılır.
 */
export function findByScalePrefix(db: PosDatabase, barcode: string): CatalogProduct | null {
  const stable = barcode.slice(0, 7);
  const row = db
    .prepare(
      `${SELECT_PRODUCT}
        WHERE p.id = (SELECT b.product_id FROM product_barcodes b
                       WHERE length(b.value) = 13 AND substr(b.value, 1, 7) = ? LIMIT 1)`,
    )
    .get(stable) as ProductRow | undefined;
  return row ? toProduct(row) : null;
}

export function findProductById(db: PosDatabase, id: string): CatalogProduct | null {
  const row = db.prepare(`${SELECT_PRODUCT} WHERE p.id = ?`).get(id) as ProductRow | undefined;
  return row ? toProduct(row) : null;
}

/** LIKE jokerlerini kaçırır; "%" yazan kasiyer tüm katalogu getirmesin. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}
