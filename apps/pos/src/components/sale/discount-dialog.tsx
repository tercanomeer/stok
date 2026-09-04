import { useEffect, useRef, useState, type ReactElement } from 'react';

import { Button, Dialog, Field, Input } from '@stokk/ui';

interface DiscountDialogProps {
  /** Seçili satırın adı; yoksa indirim FİŞE uygulanır. */
  lineName: string | null;
  currentRate: string | null;
  /** Bu oranın üstü `sale.discount.high` ister. */
  threshold: string;
  allowHigh: boolean;
  onClose: () => void;
  onApply: (rate: string | null) => void;
}

/**
 * İndirim modalı (F3).
 *
 * Seçili satır varsa indirim o satıra, yoksa fişin tamamına uygulanır — kasiyerin
 * "şu ürüne %10" ile "fişe %10" ayrımını ayrı bir menüye gitmeden yapabilmesi için.
 *
 * Eşiği aşan oran YETKİ ister. Kontrol burada, main process'te ve sunucuda üç kez
 * yapılıyor; buradaki, kasiyeri müşterinin önünde reddedilmekten kurtarmak için.
 */
export function DiscountDialog({
  lineName,
  currentRate,
  threshold,
  allowHigh,
  onClose,
  onApply,
}: DiscountDialogProps): ReactElement {
  // Modal yalnız açıkken mount ediliyor; mevcut oran doğrudan başlangıç değeri.
  const [rate, setRate] = useState(currentRate ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  // `autoFocus` yerine effect: yerel `<dialog>`'un `showModal()` çağrısı odağı
  // kendi ilk düğmesine taşıyıp autoFocus'u eziyor.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const value = Number(rate);
  const invalid = rate !== '' && (!Number.isFinite(value) || value < 0 || value > 100);
  const overThreshold = !invalid && rate !== '' && value > Number(threshold);
  const blocked = overThreshold && !allowHigh;
  const canApply = !invalid && !blocked && rate !== '';

  return (
    <Dialog
      open
      onClose={onClose}
      title={lineName ? `İndirim — ${lineName}` : 'Fiş indirimi'}
      description={
        lineName
          ? 'Yalnız seçili satıra uygulanır.'
          : 'Tüm satırlara uygulanır; satır indirimiyle birleşir.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Vazgeç (Esc)
          </Button>
          {currentRate ? (
            <Button
              variant="secondary"
              onClick={() => {
                onApply(null);
              }}
            >
              İndirimi kaldır
            </Button>
          ) : null}
          <Button
            disabled={!canApply}
            onClick={() => {
              onApply(rate);
            }}
          >
            Uygula
          </Button>
        </>
      }
    >
      <Field
        label="İndirim oranı (%)"
        error={
          invalid
            ? 'Oran 0 ile 100 arasında olmalı.'
            : blocked
              ? `%${threshold} üzeri indirim yetkiniz yok; yöneticinizden onay alın.`
              : undefined
        }
        hint={
          overThreshold && allowHigh ? `%${threshold} üzeri indirim uyguluyorsunuz.` : undefined
        }
      >
        {({ id, describedBy }) => (
          <Input
            id={id}
            ref={inputRef}
            aria-describedby={describedBy}
            value={rate}
            inputMode="decimal"
            invalid={invalid || blocked}
            onChange={(event) => {
              setRate(event.target.value.replace(',', '.'));
            }}
            onKeyDown={(event) => {
              // Kasiyer ödeme modalında Enter'a alıştı; tek alanlı bu modalde de
              // Enter onaylamalı, yoksa Tab'lamak zorunda kalıyor.
              if (event.key !== 'Enter' || !canApply) return;
              event.preventDefault();
              onApply(rate);
            }}
          />
        )}
      </Field>
    </Dialog>
  );
}
