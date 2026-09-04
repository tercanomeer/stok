import { User, X } from 'lucide-react';
import { memo, type ReactElement } from 'react';

import type { SaleTotals } from '@stokk/pos-core';
import { Button, formatMoney } from '@stokk/ui';

interface TotalsPanelProps {
  totals: SaleTotals;
  itemCount: number;
  customerName: string | null;
  documentDiscountRate: string | null;
  disabled: boolean;
  onPay: () => void;
  onClearCustomer: () => void;
}

/**
 * Toplam paneli — ekranın en yüksek kontrastlı, en büyük puntolu alanı.
 *
 * Müşteriye söylenen sayı burada; ara toplam ve KDV kırılımı bilgi olarak altta
 * kalıyor. Ödeme düğmesi F1 ile aynı işi yapar ve tuş adı üzerinde yazar: kasiyer
 * kısayolu ekrandan öğrensin, kılavuz okumasın.
 */
export const TotalsPanel = memo(function TotalsPanel({
  totals,
  itemCount,
  customerName,
  documentDiscountRate,
  disabled,
  onPay,
  onClearCustomer,
}: TotalsPanelProps): ReactElement {
  return (
    <section className="border-border bg-surface-raised flex flex-col gap-3 border-t p-4">
      {customerName ? (
        <div className="bg-surface-sunken rounded-control flex items-center gap-2 px-3 py-2 text-sm">
          <User className="size-4" aria-hidden />
          <span className="text-ink flex-1 truncate">{customerName}</span>
          <Button variant="ghost" size="sm" aria-label="Müşteriyi kaldır" onClick={onClearCustomer}>
            <X aria-hidden />
          </Button>
        </div>
      ) : null}

      <dl className="text-ink-muted flex flex-col gap-1 text-sm">
        <div className="flex justify-between">
          <dt>Ara toplam (KDV hariç)</dt>
          <dd className="tabular-nums">{formatMoney(totals.subtotal)}</dd>
        </div>
        {Number(totals.discountTotal) > 0 ? (
          <div className="text-warning flex justify-between">
            <dt>İndirim{documentDiscountRate ? ` (%${documentDiscountRate} fiş)` : ''}</dt>
            <dd className="tabular-nums">−{formatMoney(totals.discountTotal)}</dd>
          </div>
        ) : null}
        {totals.vatBreakdown.map((entry) => (
          <div key={entry.vatRate} className="flex justify-between">
            <dt>KDV %{entry.vatRate}</dt>
            <dd className="tabular-nums">{formatMoney(entry.vatAmount)}</dd>
          </div>
        ))}
      </dl>

      <div className="border-border flex items-end justify-between border-t pt-3">
        <span className="text-ink-muted text-sm">{itemCount} kalem</span>
        <span className="text-ink text-4xl font-bold tabular-nums">
          {formatMoney(totals.grandTotal)}
        </span>
      </div>

      <Button size="lg" className="h-14 text-lg" disabled={disabled} onClick={onPay}>
        Ödeme al · F1
      </Button>
    </section>
  );
});
