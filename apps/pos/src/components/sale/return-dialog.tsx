import type { RecentSale, ReturnInput } from '@shared/ipc-contracts';
import { useEffect, useRef, useState, type ReactElement } from 'react';

import { calculateRefundAmount } from '@stokk/pos-core';
import {
  Button,
  Dialog,
  EmptyState,
  Field,
  Input,
  Select,
  formatDateTime,
  formatMoney,
  formatQuantity,
} from '@stokk/ui';


import { bridge, errorMessage, unwrap } from '../../lib/bridge';

interface ReturnDialogProps {
  online: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}

const METHODS = [
  { value: 'CASH', label: 'Nakit' },
  { value: 'CARD', label: 'Kart' },
  { value: 'TRANSFER', label: 'Havale' },
  { value: 'CREDIT', label: 'Cari alacak' },
] as const;

/**
 * İade (F6).
 *
 * İade ÇEVRİMİÇİ yapılır: stok geri girer, cari hareket düzelir, iade fişi
 * numaralanır — bunların hiçbiri kasada tek başına doğru yapılamaz. Bağlantı yoksa
 * ekran nedenini söyleyip kapanır.
 *
 * İade tutarı `@stokk/pos-core:calculateRefundAmount` ile hesaplanır: satır indirimli
 * satıldıysa iade de indirimli tutardan yapılmalı, ham birim fiyattan değil.
 */
export function ReturnDialog({ online, onClose, onDone }: ReturnDialogProps): ReactElement {
  const [query, setQuery] = useState('');
  const [sales, setSales] = useState<RecentSale[]>([]);
  const [selected, setSelected] = useState<RecentSale | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState<ReturnInput['refundMethod']>('CASH');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Modal açılınca odak arama kutusunda olmalı; yerel `<dialog>` varsayılanı onu
  // üstteki kapatma düğmesine götürüyor ve kasiyere bir Tab daha bastırıyor.
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Modal yalnız açıkken mount ediliyor; state her açılışta temiz başlıyor.
  useEffect(() => {
    if (!online || selected) return;
    let active = true;
    const timer = setTimeout(() => {
      unwrap(bridge().sale.recent(query))
        .then((items) => {
          if (active) {
            setSales(items);
            setError(null);
          }
        })
        .catch((listError: unknown) => {
          if (active) setError(errorMessage(listError, 'Satışlar getirilemedi.'));
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [online, query, selected]);

  const items = (selected?.items ?? []).map((item) => {
    const remaining = Number(item.quantity) - Number(item.returnedQuantity);
    const requested = quantities[item.saleItemId] ?? '';
    return { item, remaining, requested };
  });

  const chosen = items.filter(({ requested }) => Number(requested) > 0);
  const refundTotal = chosen
    .reduce(
      (sum, { item, requested }) =>
        sum + Number(calculateRefundAmount(item.lineTotal, item.quantity, requested)),
      0,
    )
    .toFixed(2);

  const overLimit = items.some(({ remaining, requested }) => Number(requested) > remaining);
  const canSubmit = chosen.length > 0 && !overLimit && reason.trim() !== '' && !busy;

  function submit(): void {
    if (!selected) return;
    setBusy(true);
    unwrap(
      bridge().sale.return({
        saleId: selected.id,
        refundMethod: method,
        reason: reason.trim(),
        items: chosen.map(({ item, requested }) => ({
          saleItemId: item.saleItemId,
          quantity: requested,
        })),
      }),
    )
      .then((result) => {
        onDone(`İade alındı: ${formatMoney(result.totalAmount)}`);
      })
      .catch((returnError: unknown) => {
        setError(errorMessage(returnError, 'İade kaydedilemedi.'));
      })
      .finally(() => {
        setBusy(false);
      });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      closeDisabled={busy}
      title="İade"
      description={
        selected ? `Fiş ${selected.receiptNo ?? selected.id}` : 'İade edilecek satışı seçin.'
      }
      className="w-[min(40rem,calc(100vw-2rem))]"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Kapat (Esc)
          </Button>
          {selected ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setSelected(null);
                setQuantities({});
              }}
            >
              Başka satış
            </Button>
          ) : null}
          {selected ? (
            <Button loading={busy} disabled={!canSubmit} onClick={submit}>
              {formatMoney(refundTotal)} iade et
            </Button>
          ) : null}
        </>
      }
    >
      {!online ? (
        <EmptyState
          title="İade için bağlantı gerekli"
          description="İade stok ve cari hareketi ürettiği için sunucuya bağlıyken yapılır."
        />
      ) : selected === null ? (
        <div className="flex flex-col gap-3">
          <Input
            ref={searchRef}
            value={query}
            placeholder="Fiş no ile ara"
            aria-label="Satış ara"
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
          {sales.length === 0 ? (
            <EmptyState title="Satış bulunamadı" />
          ) : (
            <ul className="divide-border max-h-72 divide-y overflow-y-auto">
              {sales.map((sale) => (
                <li key={sale.id}>
                  <button
                    type="button"
                    className="hover:bg-surface-sunken flex w-full items-center gap-3 px-2 py-2 text-left"
                    onClick={() => {
                      setSelected(sale);
                    }}
                  >
                    <span className="flex-1">
                      <span className="text-ink block font-medium">
                        {sale.receiptNo ?? 'Fiş no yok'}
                      </span>
                      <span className="text-ink-muted block text-xs">
                        {formatDateTime(sale.soldAt)}
                      </span>
                    </span>
                    <span className="text-ink tabular-nums">{formatMoney(sale.grandTotal)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <ul className="divide-border max-h-56 divide-y overflow-y-auto">
            {items.map(({ item, remaining, requested }) => (
              <li key={item.saleItemId} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="text-ink block truncate">{item.productName}</span>
                  <span className="text-ink-muted block text-xs">
                    İade edilebilir: {formatQuantity(String(remaining))}
                  </span>
                </span>
                <Input
                  className="w-24"
                  value={requested}
                  inputMode="decimal"
                  disabled={remaining <= 0}
                  invalid={Number(requested) > remaining}
                  aria-label={`${item.productName} iade miktarı`}
                  onChange={(event) => {
                    setQuantities((current) => ({
                      ...current,
                      [item.saleItemId]: event.target.value.replace(',', '.'),
                    }));
                  }}
                />
              </li>
            ))}
          </ul>

          <Field label="İade yöntemi">
            {({ id }) => (
              <Select
                id={id}
                value={method}
                onChange={(event) => {
                  setMethod(event.target.value as ReturnInput['refundMethod']);
                }}
              >
                {METHODS.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="İade nedeni" required>
            {({ id }) => (
              <Input
                id={id}
                value={reason}
                maxLength={300}
                onChange={(event) => {
                  setReason(event.target.value);
                }}
              />
            )}
          </Field>

          {overLimit ? (
            <p className="text-danger text-sm" role="alert">
              İade miktarı satılandan fazla olamaz.
            </p>
          ) : null}
        </div>
      )}

      {error ? (
        <p className="text-danger mt-3 text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
