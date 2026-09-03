'use client';

import { ScanBarcode } from 'lucide-react';
import { useState, type ReactElement, type Ref } from 'react';

import { formatMoney, formatQuantity, Input, Spinner, useToast } from '@stokk/ui';

import { useDebouncedValue } from '../../hooks/use-debounced-value';
import { useProductSearch } from '../../hooks/use-products';
import { apiErrorMessage, apiGet } from '../../lib/api';
import type { Paginated, Product } from '../../lib/api-types';

export interface ProductPickerProps {
  onSelect: (product: Product) => void;
  ref?: Ref<HTMLInputElement> | undefined;
}

/**
 * Kalem girişi: barkod okutma + ada göre arama tek alanda.
 *
 * Yazarken açılan öneri listesi GECİKMELİ (300 ms) — her tuşta sunucuya gidilmesin.
 * Ama barkod okuyucu kodu milisaniyeler içinde yazıp Enter basar; gecikmeli listeye
 * bakmak yarış demektir (liste henüz gelmemişken Enter boşa gider). Bu yüzden Enter
 * KENDİ sorgusunu anında atar ve tek sonuç varsa kalemi ekler. Sonuç yoksa kasiyer
 * sessizce takılmasın diye uyarı verilir.
 */
export function ProductPicker({ onSelect, ref }: ProductPickerProps): ReactElement {
  const [term, setTerm] = useState('');
  const [resolving, setResolving] = useState(false);
  const debounced = useDebouncedValue(term);
  const results = useProductSearch(debounced);
  const toast = useToast();
  const items = results.data?.items ?? [];

  function pick(product: Product): void {
    onSelect(product);
    setTerm('');
  }

  async function resolveNow(): Promise<void> {
    const value = term.trim();
    if (!value || resolving) return;
    setResolving(true);
    try {
      const page = await apiGet<Paginated<Product>>('/products', {
        params: { search: value, limit: 10 },
      });
      const first = page.items[0];
      if (page.items.length === 1 && first) pick(first);
      else if (page.items.length === 0) toast.error('Ürün bulunamadı', value);
      // Birden fazla sonuçta liste zaten açılır; seçim kullanıcıya bırakılır.
    } catch (error) {
      toast.error('Arama başarısız', apiErrorMessage(error));
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className="space-y-2">
      <label htmlFor="purchase-product" className="text-ink block text-sm font-medium">
        Ürün ekle
      </label>
      <div className="relative">
        <ScanBarcode
          className="text-ink-subtle pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          id="purchase-product"
          ref={ref}
          value={term}
          autoComplete="off"
          className="tabular pl-9"
          placeholder="Barkod okutun veya ürün adı yazın"
          onChange={(e) => {
            setTerm(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            // Barkod okuyucu sonda Enter gönderir; formu göndermesin, kalemi eklesin.
            e.preventDefault();
            void resolveNow();
          }}
        />
      </div>

      {(debounced && results.isPending) || resolving ? <Spinner label="Aranıyor" /> : null}

      {items.length > 0 ? (
        <ul className="border-border rounded-control max-h-56 divide-y divide-[var(--border)] overflow-y-auto border">
          {items.map((product) => (
            <li key={product.id}>
              <button
                type="button"
                onClick={() => {
                  pick(product);
                }}
                className="hover:bg-surface-sunken flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm"
              >
                <span>
                  <span className="text-ink font-medium">{product.name}</span>
                  {product.barcodes[0] ? (
                    <span className="text-ink-subtle tabular ml-2 text-xs">
                      {product.barcodes[0].value}
                    </span>
                  ) : null}
                </span>
                <span className="text-ink-muted tabular shrink-0">
                  {formatQuantity(product.stockQuantity)} · {formatMoney(product.salePrice)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : debounced && !results.isPending ? (
        <p className="text-ink-muted text-sm">Eşleşen ürün yok.</p>
      ) : null}
    </div>
  );
}
