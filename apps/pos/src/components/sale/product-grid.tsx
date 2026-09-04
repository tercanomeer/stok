import type { CatalogProduct } from '@shared/ipc-contracts';
import { memo, type ReactElement } from 'react';

import { EmptyState, formatMoney } from '@stokk/ui';


interface ProductGridProps {
  products: CatalogProduct[];
  onPick: (product: CatalogProduct) => void;
}

/**
 * Ürün gridi — barkodu olmayan ürünler (açık çay, poşet, sebze) için.
 *
 * Barkod okutmak asıl yoldur; bu grid onun yerine değil YANINDA durur. Bu yüzden
 * odak burada değil barkod alanındadır ve grid tıklamayla çalışır; klavyeyle
 * gezinmek gerekmiyor, kasiyer aradığını barkod alanına yazıp Enter'a basıyor.
 *
 * `memo`: sepet her değiştiğinde 40 ürün düğmesini yeniden çizmek 16 ms
 * bütçesini yiyordu; grid yalnız arama sonucu değişince çiziliyor.
 */
export const ProductGrid = memo(function ProductGrid({
  products,
  onPick,
}: ProductGridProps): ReactElement {
  if (products.length === 0) {
    return (
      <EmptyState
        title="Ürün bulunamadı"
        description="Katalog henüz alınmamış ya da arama karşılık vermedi."
        className="m-4"
      />
    );
  }

  return (
    // `role="list"` VERİLMEZ: düğmelere liste öğesi rolü yazmak ekran okuyucuda
    // "buton" semantiğini siler. Grup adı `aria-label` ile veriliyor.
    <div
      className="grid flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto p-3 lg:grid-cols-3 xl:grid-cols-4"
      aria-label="Ürünler"
    >
      {products.map((product) => (
        <button
          key={product.id}
          type="button"
          onClick={() => {
            onPick(product);
          }}
          className="rounded-card border-border bg-surface-raised hover:border-border-strong focus-visible:outline-brand flex h-24 flex-col justify-between border p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <span className="text-ink line-clamp-2 text-sm font-medium">{product.name}</span>
          <span className="text-ink text-base font-semibold tabular-nums">
            {formatMoney(product.salePrice)}
          </span>
        </button>
      ))}
    </div>
  );
});
