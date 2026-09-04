import { Minus, Plus, StickyNote, Trash2 } from 'lucide-react';
import { memo, type ReactElement } from 'react';

import { Button, EmptyState, cn, formatMoney, formatQuantity } from '@stokk/ui';

import type { CartLine } from '../../store/cart-store';

interface CartListProps {
  lines: CartLine[];
  /** Satır kimliği → tutar. Hesap `@stokk/pos-core`'da; liste yalnız gösterir. */
  totals: Map<string, string>;
  selectedLineId: string | null;
  onSelect: (lineId: string) => void;
  onStep: (lineId: string, delta: number) => void;
  onRemove: (lineId: string) => void;
}

interface CartRowProps {
  line: CartLine;
  total: string;
  selected: boolean;
  onSelect: (lineId: string) => void;
  onStep: (lineId: string, delta: number) => void;
  onRemove: (lineId: string) => void;
}

/**
 * Tek sepet satırı — `memo` ile sarılı.
 *
 * 30 kalemlik bir sepette her `+` tuşuna basışta 30 satırın tamamını yeniden
 * çizmek 16 ms bütçesini aşıyordu (Faz 13 performans ölçümü). Satır kendi
 * verisi değişmedikçe yeniden çizilmiyor; geri çağrılar bu yüzden ekranda
 * `useCallback` ile sabitleniyor.
 */
const CartRow = memo(function CartRow({
  line,
  total,
  selected,
  onSelect,
  onStep,
  onRemove,
}: CartRowProps): ReactElement {
  const shortStock = line.trackStock && Number(line.stockQuantity) < Number(line.quantity);
  return (
    <li
      aria-current={selected || undefined}
      onClick={() => {
        onSelect(line.lineId);
      }}
      className={cn(
        'border-border flex items-center gap-3 border-b px-4 py-3',
        selected ? 'bg-surface-sunken' : 'bg-surface-raised',
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-ink truncate text-base font-medium">{line.name}</p>
        <p className="text-ink-muted text-sm">
          {formatQuantity(line.quantity)} × {formatMoney(line.unitPrice)}
          {line.discountRate === undefined ? null : (
            <span className="text-warning"> · %{line.discountRate} indirim</span>
          )}
          {shortStock ? <span className="text-danger"> · stok yetersiz</span> : null}
        </p>
        {line.note === undefined ? null : (
          <p className="text-ink-subtle flex items-center gap-1 text-xs">
            <StickyNote className="size-3" aria-hidden />
            {line.note}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          aria-label={`${line.name} miktarını azalt`}
          onClick={() => {
            onStep(line.lineId, -1);
          }}
        >
          <Minus aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`${line.name} miktarını artır`}
          onClick={() => {
            onStep(line.lineId, 1);
          }}
        >
          <Plus aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`${line.name} satırını sil`}
          onClick={() => {
            onRemove(line.lineId);
          }}
        >
          <Trash2 aria-hidden />
        </Button>
      </div>

      <p className="text-ink w-28 text-right text-lg font-semibold tabular-nums">
        {formatMoney(total)}
      </p>
    </li>
  );
});

/**
 * Sepet listesi. Kasiyer gün boyu buraya bakıyor: satır yüksekliği ve punto,
 * bir metrelik mesafeden okunacak şekilde büyük tutuldu.
 *
 * Satır seçimi klavyeyle yönetilir (ok tuşları); fare tıklaması da aynı seçimi
 * kurar, böylece `+`/`−` her iki yolda da doğru satıra uygulanır.
 */
export const CartList = memo(function CartList({
  lines,
  totals,
  selectedLineId,
  onSelect,
  onStep,
  onRemove,
}: CartListProps): ReactElement {
  if (lines.length === 0) {
    return (
      <EmptyState
        title="Sepet boş"
        description="Barkodu okutun ya da ürün adını yazın."
        className="m-4 flex-1"
      />
    );
  }

  return (
    <ul className="flex-1 overflow-y-auto" aria-label="Sepet">
      {lines.map((line) => (
        <CartRow
          key={line.lineId}
          line={line}
          total={totals.get(line.lineId) ?? '0.00'}
          selected={line.lineId === selectedLineId}
          onSelect={onSelect}
          onStep={onStep}
          onRemove={onRemove}
        />
      ))}
    </ul>
  );
});
