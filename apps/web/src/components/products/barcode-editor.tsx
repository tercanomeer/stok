'use client';

import { Plus, Star, Trash2 } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { Badge, Button, Input, useToast } from '@stokk/ui';

import { useAddBarcode, useRemoveBarcode } from '../../hooks/use-products';
import { apiErrorMessage } from '../../lib/api';
import type { ProductBarcode } from '../../lib/api-types';

export interface BarcodeEditorProps {
  /** Kayıtlı ürün id'si; yoksa (yeni ürün) barkodlar yerel taslakta tutulur. */
  productId?: string;
  barcodes: ProductBarcode[];
  /** Yeni ürün modunda taslak listeyi güncellemek için. */
  onDraftChange?: (values: string[]) => void;
}

/**
 * Çoklu barkod. Kayıtlı üründe barkodlar kendi uçlarıyla anında eklenir/silinir
 * (ürün PATCH'i barkod almaz). Yeni üründe taslak listede toplanır, ilk barkod
 * birincil olarak kaydedilir.
 */
export function BarcodeEditor({
  productId,
  barcodes,
  onDraftChange,
}: BarcodeEditorProps): ReactElement {
  const [value, setValue] = useState('');
  const [draft, setDraft] = useState<string[]>([]);
  const addBarcode = useAddBarcode();
  const removeBarcode = useRemoveBarcode();
  const toast = useToast();

  function pushDraft(next: string[]): void {
    setDraft(next);
    onDraftChange?.(next);
  }

  function handleAdd(): void {
    const trimmed = value.trim();
    if (!trimmed) return;

    if (!productId) {
      if (draft.includes(trimmed)) {
        toast.error('Bu barkod zaten listede');
        return;
      }
      pushDraft([...draft, trimmed]);
      setValue('');
      return;
    }

    addBarcode.mutate(
      { productId, value: trimmed, isPrimary: barcodes.length === 0 },
      {
        onSuccess: () => {
          setValue('');
          toast.success('Barkod eklendi', trimmed);
        },
        onError: (error) => {
          toast.error('Barkod eklenemedi', apiErrorMessage(error));
        },
      },
    );
  }

  const rows = productId
    ? barcodes.map((barcode) => ({
        key: barcode.id,
        value: barcode.value,
        primary: barcode.isPrimary,
      }))
    : draft.map((item, index) => ({ key: item, value: item, primary: index === 0 }));

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label htmlFor="barcode-input" className="text-ink mb-1.5 block text-sm font-medium">
            Barkod
          </label>
          <Input
            id="barcode-input"
            value={value}
            inputMode="numeric"
            placeholder="Okutun veya elle yazın"
            onChange={(e) => {
              setValue(e.target.value);
            }}
            onKeyDown={(e) => {
              // Barkod okuyucu sonunda Enter gönderir; form gönderimini tetiklemesin.
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
              }
            }}
          />
        </div>
        <Button variant="outline" loading={addBarcode.isPending} onClick={handleAdd}>
          <Plus aria-hidden />
          Ekle
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-ink-muted text-sm">Henüz barkod eklenmedi.</p>
      ) : (
        <ul className="divide-border border-border rounded-control divide-y border">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="tabular text-sm">{row.value}</span>
              <div className="flex items-center gap-2">
                {row.primary ? (
                  <Badge tone="brand">
                    <Star aria-hidden />
                    Birincil
                  </Badge>
                ) : null}
                <button
                  type="button"
                  aria-label={`${row.value} barkodunu sil`}
                  disabled={removeBarcode.isPending}
                  onClick={() => {
                    if (!productId) {
                      pushDraft(draft.filter((item) => item !== row.value));
                      return;
                    }
                    removeBarcode.mutate(
                      { productId, barcodeId: row.key },
                      {
                        onError: (error) => {
                          toast.error('Barkod silinemedi', apiErrorMessage(error));
                        },
                      },
                    );
                  }}
                  className="rounded-control text-ink-muted hover:bg-danger-weak hover:text-danger inline-flex size-8 items-center justify-center disabled:opacity-50"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
