import { parseScaleBarcode } from '@stokk/pos-core';

import { readSettings } from '../db/cache-repo';
import { findByBarcode, findByScalePrefix, searchProducts } from '../db/catalog-repo';
import type { PosDatabase } from '../db/database';
import type { CatalogProduct, PosSettings, ScanResult } from '../shared/ipc-contracts';

/** Kasiyer yazarken her tuşta arama yapılıyor; grid'e sığandan fazlası gösterilmiyor. */
const SEARCH_LIMIT = 40;

/**
 * Satış ekranının ürün kaynağı.
 *
 * TAMAMI yerel önbellekten okunur — internet kesikken de arama, barkod okutma ve
 * fiyat görme çalışmak zorunda. Sunucuya hiç gidilmez.
 */
export class CatalogService {
  constructor(private readonly db: PosDatabase) {}

  settings(): PosSettings | null {
    return readSettings(this.db);
  }

  search(query: string): CatalogProduct[] {
    return searchProducts(this.db, query, SEARCH_LIMIT);
  }

  /**
   * Okutulan barkodu çözer.
   *
   * Önce TAM eşleşme denenir: tartı prefix'iyle başlayan normal bir barkod varsa
   * (13 haneli sıradan EAN'lerin bir kısmı 27/28 ile başlayabilir) onu tartılı
   * sanıp miktarı barkoddan okumak yanlış olurdu.
   *
   * Tartılı barkodda gömülü 5 hane AĞIRLIK (gram) olarak yorumlanır: miktar
   * etiketten, fiyat KATALOGDAN gelir. Fiyat yorumunu seçmek, kasanın hesabı
   * `@stokk/pos-core` dışında yapması ve dükkânın belirlemediği bir tutarı fişe
   * yazması demekti. Fiyat gömen teraziler için mod ayarı Faz 14'e bırakıldı.
   */
  scan(barcode: string): ScanResult {
    const value = barcode.trim();

    const exact = findByBarcode(this.db, value);
    if (exact) return { product: exact, quantity: null, scale: false, barcode: value };

    const prefixes = this.settings()?.scaleBarcodePrefixes ?? [];
    const parsed = parseScaleBarcode(value, prefixes);
    if (!parsed) return { product: null, quantity: null, scale: false, barcode: value };

    return {
      product: findByScalePrefix(this.db, value),
      quantity: parsed.embeddedWeightKg,
      scale: true,
      barcode: value,
    };
  }
}
