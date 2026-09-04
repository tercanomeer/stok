import type { ParkedSale } from '@shared/ipc-contracts';
import { Trash2 } from 'lucide-react';
import type { ReactElement } from 'react';

import { Button, Dialog, EmptyState, formatCount, formatMoney, formatRelative } from '@stokk/ui';


interface ParkedDialogProps {
  parked: ParkedSale[];
  /** Sepette satır varsa geri alma sepeti ezer — kasiyer önce onu bitirmeli. */
  cartBusy: boolean;
  onClose: () => void;
  onResume: (id: string) => void;
  onDiscard: (id: string) => void;
}

/**
 * Park listesi (F5).
 *
 * Geri alınan sepet listeden DÜŞER: aynı sepetin iki kez satılması, park mekanizmasının
 * en pahalı hatası olurdu. Sepet doluyken geri alma kapalı — üstüne yazmak yerine
 * kasiyerden mevcut sepeti bitirmesi ya da park etmesi isteniyor.
 */
export function ParkedDialog({
  parked,
  cartBusy,
  onClose,
  onResume,
  onDiscard,
}: ParkedDialogProps): ReactElement {
  return (
    <Dialog
      open
      onClose={onClose}
      title="Park edilmiş satışlar"
      description={
        cartBusy ? 'Sepetiniz dolu; geri almadan önce sepeti bitirin ya da park edin.' : undefined
      }
      footer={
        <Button variant="ghost" onClick={onClose}>
          Kapat (Esc)
        </Button>
      }
    >
      {parked.length === 0 ? (
        <EmptyState
          title="Park edilmiş satış yok"
          description="Sepeti F4 ile park edebilirsiniz."
        />
      ) : (
        <ul className="divide-border max-h-80 divide-y overflow-y-auto">
          {parked.map((sale) => (
            <li key={sale.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-ink truncate font-medium">{sale.label}</p>
                <p className="text-ink-muted text-xs">
                  {formatCount(sale.itemCount)} kalem · {formatRelative(sale.parkedAt)}
                </p>
              </div>
              <span className="text-ink tabular-nums">{formatMoney(sale.grandTotal)}</span>
              <Button
                size="sm"
                disabled={cartBusy}
                onClick={() => {
                  onResume(sale.id);
                }}
              >
                Geri al
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`${sale.label} kaydını sil`}
                onClick={() => {
                  onDiscard(sale.id);
                }}
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
