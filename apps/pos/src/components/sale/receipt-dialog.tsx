import type { CompletedSale } from '@shared/ipc-contracts';
import { CloudUpload, Printer } from 'lucide-react';
import { useEffect, useRef, type ReactElement } from 'react';

import { Badge, Button, Dialog, formatDateTime, formatMoney, formatQuantity } from '@stokk/ui';


interface ReceiptDialogProps {
  sale: CompletedSale;
  onClose: () => void;
  onPrint: () => void;
}

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Nakit',
  CARD: 'Kart',
  TRANSFER: 'Havale',
  CREDIT: 'Veresiye',
};

/**
 * Satış sonrası fiş önizlemesi.
 *
 * Aynı veri Faz 14'te yazıcıya gidecek; ekranda gördüğü ile kâğıttan çıkan aynı
 * olsun diye fiş yapısı burada da `ReceiptData`'dan okunuyor, yeniden kurulmuyor.
 *
 * Para üstü en büyük puntoda: kasiyerin satış biter bitmez bakacağı tek sayı odur.
 */
export function ReceiptDialog({ sale, onClose, onPrint }: ReceiptDialogProps): ReactElement {
  const receipt = sale.receipt;
  const nextRef = useRef<HTMLButtonElement>(null);

  /**
   * Odak "Yeni satış" düğmesinde başlar.
   *
   * `autoFocus` burada YETMİYOR: yerel `<dialog>`, `showModal()` çağrıldığında odağı
   * kendi ilk odaklanabilir öğesine (üstteki kapatma düğmesi) taşıyor ve React'in
   * autoFocus'unu eziyor. Bu effect `Dialog`'un kendi effect'inden SONRA çalışır.
   */
  useEffect(() => {
    nextRef.current?.focus();
  }, []);
  return (
    <Dialog
      open
      onClose={onClose}
      title="Satış tamamlandı"
      description={
        receipt?.receiptNo ? `Fiş no ${receipt.receiptNo}` : 'Fiş no sunucuya ulaşınca atanacak.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onPrint}>
            <Printer aria-hidden />
            Yazdır
          </Button>
          {/* Etiket Enter diyorsa odak da burada olmalı — yoksa Enter yerel
              `<dialog>`'un ilk odaklanabilir düğmesine gider. */}
          <Button ref={nextRef} onClick={onClose}>
            Yeni satış (Enter)
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {Number(sale.changeDue) > 0 ? (
          <div
            role="status"
            aria-live="polite"
            className="bg-surface-sunken rounded-control flex items-baseline justify-between px-4 py-3"
          >
            <span className="text-ink-muted text-sm">Para üstü</span>
            <span className="text-ink text-4xl font-bold tabular-nums">
              {formatMoney(sale.changeDue)}
            </span>
          </div>
        ) : null}

        {sale.synced ? null : (
          <Badge tone="warning">
            <CloudUpload aria-hidden />
            Satış kuyrukta; bağlantı gelince gönderilecek.
          </Badge>
        )}

        <div className="border-border rounded-card border p-3 font-mono text-xs">
          {receipt.header ? (
            <p className="mb-2 text-center whitespace-pre-line">{receipt.header}</p>
          ) : null}
          <p className="text-ink-muted">
            {formatDateTime(receipt.soldAt)} · {receipt.registerName ?? 'Kasa'} ·{' '}
            {receipt.cashierName}
          </p>
          {receipt.contactName ? (
            <p className="text-ink-muted">Müşteri: {receipt.contactName}</p>
          ) : null}

          <ul className="border-border my-2 border-y py-2">
            {receipt.lines.map((line, index) => (
              <li key={`${line.name}-${index}`} className="flex justify-between gap-2">
                <span className="min-w-0 flex-1 truncate">
                  {formatQuantity(line.quantity)} × {line.name}
                </span>
                <span className="tabular-nums">{formatMoney(line.lineTotal)}</span>
              </li>
            ))}
          </ul>

          <dl className="flex flex-col gap-0.5">
            <div className="flex justify-between">
              <dt>Ara toplam</dt>
              <dd className="tabular-nums">{formatMoney(receipt.subtotal)}</dd>
            </div>
            {receipt.vatBreakdown.map((entry) => (
              <div key={entry.vatRate} className="flex justify-between">
                <dt>KDV %{entry.vatRate}</dt>
                <dd className="tabular-nums">{formatMoney(entry.vatAmount)}</dd>
              </div>
            ))}
            <div className="mt-1 flex justify-between text-sm font-bold">
              <dt>TOPLAM</dt>
              <dd className="tabular-nums">{formatMoney(receipt.grandTotal)}</dd>
            </div>
            {receipt.payments.map((payment, index) => (
              <div key={`${payment.method}-${index}`} className="flex justify-between">
                <dt>{METHOD_LABEL[payment.method] ?? payment.method}</dt>
                <dd className="tabular-nums">{formatMoney(payment.amount)}</dd>
              </div>
            ))}
          </dl>

          {receipt.footer ? (
            <p className="mt-2 text-center whitespace-pre-line">{receipt.footer}</p>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}
