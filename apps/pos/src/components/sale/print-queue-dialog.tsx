import type { PrintJob } from '@shared/ipc-contracts';
import { Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactElement } from 'react';

import { Button, Dialog, EmptyState, formatDateTime, formatMoney } from '@stokk/ui';


import { bridge, errorMessage, unwrap } from '../../lib/bridge';

interface PrintQueueDialogProps {
  onClose: () => void;
  /** Kuyruk değiştikçe üst şerit rozeti güncellensin. */
  onChange: (pending: number) => void;
}

/**
 * Basılamamış fişler.
 *
 * Yazıcı yokken/kağıt bitmişken satış tamamlanır ve fiş buraya düşer. Kasiyerin
 * kağıdı takıp "yeniden bas" demesi yeter; fiş satışın YAPILDIĞI andaki hâliyle
 * saklandığı için sonradan basılan kağıt da doğru tutarları taşır.
 */
export function PrintQueueDialog({ onClose, onChange }: PrintQueueDialogProps): ReactElement {
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    unwrap(bridge().printer.pending())
      .then((list) => {
        setJobs(list);
        onChange(list.length);
      })
      .catch((listError: unknown) => {
        setError(errorMessage(listError, 'Liste alınamadı.'));
      });
  }, [onChange]);

  useEffect(refresh, [refresh]);

  function retry(): void {
    setBusy(true);
    setError(null);
    unwrap(bridge().printer.retryPending())
      .then((result) => {
        if (result.remaining > 0) {
          setError('Bazı fişler hâlâ basılamıyor. Yazıcıyı ve kağıdı kontrol edin.');
        }
        refresh();
      })
      .catch((retryError: unknown) => {
        setError(errorMessage(retryError, 'Yeniden basılamadı.'));
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
      title="Basılamamış fişler"
      description="Bu satışlar tamamlandı; yalnız fişleri basılamadı."
      className="w-[min(38rem,calc(100vw-2rem))]"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Kapat (Esc)
          </Button>
          <Button loading={busy} disabled={jobs.length === 0 || busy} onClick={retry}>
            Hepsini yeniden bas
          </Button>
        </>
      }
    >
      {jobs.length === 0 ? (
        <EmptyState title="Bekleyen fiş yok" />
      ) : (
        <ul
          className="divide-border max-h-80 divide-y overflow-y-auto"
          aria-label="Bekleyen fişler"
        >
          {jobs.map((job) => (
            <li key={job.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-ink text-sm">
                  {job.receiptNo ? `Fiş ${job.receiptNo}` : 'Fiş no atanmadı'} ·{' '}
                  {formatDateTime(job.createdAt)}
                </p>
                <p className="text-danger text-xs">
                  {job.attempts} deneme · {job.lastError ?? 'Sebep bildirilmedi.'}
                </p>
              </div>
              <span className="text-ink tabular-nums">{formatMoney(job.grandTotal)}</span>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Fişi listeden çıkar"
                disabled={busy}
                onClick={() => {
                  unwrap(bridge().printer.discardPending(job.id)).then(refresh).catch(refresh);
                }}
              >
                <Trash2 aria-hidden />
              </Button>
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
