import type { FailedSale } from '@shared/ipc-contracts';
import { useEffect, useState, type ReactElement } from 'react';

import { Button, Dialog, EmptyState, formatDateTime, formatMoney } from '@stokk/ui';


import { bridge, errorMessage, unwrap } from '../../lib/bridge';

interface FailedSalesDialogProps {
  onClose: () => void;
  onRequeued: (count: number) => void;
}

/**
 * Gönderilemeyen satışlar.
 *
 * Kuyruk beş denemeden sonra pes eder ve kaydı kalıcı hata listesine düşürür
 * (`sync-service.ts`). O satışlarda para ALINMIŞTIR: sunucu onları reddettiği için
 * ciroya, stoğa ve cariye hiç işlenmemişlerdir. Bu ekran olmadan durum yalnız üst
 * şeritte bir sayı olarak görünüyor, kasiyerin yapabileceği hiçbir şey olmuyordu.
 *
 * Sunucunun reddi genelde geçicidir (vardiya kapanmış, stok politikası, kredi limiti);
 * sebep düzeltildikten sonra "Tekrar dene" kayıtları kuyruğa geri koyar.
 */
export function FailedSalesDialog({ onClose, onRequeued }: FailedSalesDialogProps): ReactElement {
  const [sales, setSales] = useState<FailedSale[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    unwrap(bridge().sync.failedSales())
      .then((items) => {
        if (active) setSales(items);
      })
      .catch((listError: unknown) => {
        if (active) setError(errorMessage(listError, 'Liste alınamadı.'));
      });
    return () => {
      active = false;
    };
  }, []);

  function retry(): void {
    setBusy(true);
    unwrap(bridge().sync.retryFailed())
      .then((result) => {
        onRequeued(result.requeued);
      })
      .catch((retryError: unknown) => {
        setError(errorMessage(retryError, 'Tekrar denenemedi.'));
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
      title="Gönderilemeyen satışlar"
      description="Bu satışların parası alındı ama sunucuya işlenemedi."
      className="w-[min(38rem,calc(100vw-2rem))]"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Kapat (Esc)
          </Button>
          <Button loading={busy} disabled={sales.length === 0 || busy} onClick={retry}>
            Hepsini tekrar dene
          </Button>
        </>
      }
    >
      {sales.length === 0 ? (
        <EmptyState title="Gönderilemeyen satış yok" />
      ) : (
        <ul
          className="divide-border max-h-80 divide-y overflow-y-auto"
          aria-label="Gönderilemeyen satışlar"
        >
          {sales.map((sale) => (
            <li key={sale.entityId} className="flex flex-col gap-0.5 py-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-ink text-sm">
                  {sale.soldAt ? formatDateTime(sale.soldAt) : 'Tarih yok'}
                </span>
                <span className="text-ink tabular-nums">
                  {sale.grandTotal ? formatMoney(sale.grandTotal) : '—'}
                </span>
              </div>
              <p className="text-danger text-xs">
                {sale.attempts} deneme · {sale.lastError ?? 'Sebep bildirilmedi.'}
              </p>
            </li>
          ))}
        </ul>
      )}

      {error ? (
        <p className="text-danger mt-3 text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
