import type { ShiftCloseResult } from '@shared/ipc-contracts';
import { useEffect, useRef, useState, type ReactElement } from 'react';

import { Button, Dialog, Field, Input, Textarea, formatMoney } from '@stokk/ui';


import { bridge, errorMessage, unwrap } from '../../lib/bridge';

interface CloseShiftDialogProps {
  onClose: () => void;
  onClosed: (result: ShiftCloseResult) => void;
}

/**
 * Vardiya kapanışı (F10).
 *
 * Kasiyer çekmecedeki nakdi sayar, sistem beklediği tutarla karşılaştırır. Beklenen
 * tutar SUNUCUDA hesaplanır — kasada hesaplamak, gönderilmemiş satışlar yüzünden
 * yanlış olurdu. Fark ekranda gösterilir ve eşiği aşarsa vurgulanır: kasiyer
 * çekmeceyi kapatmadan önce bir kez daha saysın.
 */
export function CloseShiftDialog({ onClose, onClosed }: CloseShiftDialogProps): ReactElement {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ShiftCloseResult | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  // `autoFocus` yerine effect; bkz. discount-dialog.tsx'teki aynı not.
  useEffect(() => {
    amountRef.current?.focus();
  }, []);

  // Özet görünümüne geçilince odak "Tamam"a taşınır; yoksa kapanış sonrası
  // odak sayım alanının kalıntısında kalıp kasiyeri Tab'lamaya zorluyor.
  useEffect(() => {
    if (result) okRef.current?.focus();
  }, [result]);

  const valid = /^\d{1,10}(\.\d{1,2})?$/.test(amount);

  function submit(): void {
    setBusy(true);
    setError(null);
    unwrap(
      bridge().shift.close({
        closingAmount: amount,
        ...(note.trim() === '' ? {} : { note: note.trim() }),
      }),
    )
      .then(setResult)
      .catch((closeError: unknown) => {
        setError(errorMessage(closeError, 'Vardiya kapatılamadı.'));
      })
      .finally(() => {
        setBusy(false);
      });
  }

  if (result) {
    const difference = Number(result.differenceAmount);
    return (
      <Dialog
        open
        onClose={() => {
          onClosed(result);
        }}
        title="Vardiya kapatıldı"
        footer={
          <Button
            ref={okRef}
            onClick={() => {
              onClosed(result);
            }}
          >
            Tamam
          </Button>
        }
      >
        <dl className="flex flex-col gap-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-muted">Sayılan</dt>
            <dd className="text-ink tabular-nums">{formatMoney(result.closingAmount)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-muted">Beklenen</dt>
            <dd className="text-ink tabular-nums">{formatMoney(result.expectedAmount)}</dd>
          </div>
          <div
            className={`flex justify-between font-semibold ${
              result.overThreshold ? 'text-danger' : 'text-ink'
            }`}
          >
            <dt>Fark</dt>
            <dd className="tabular-nums">{formatMoney(result.differenceAmount)}</dd>
          </div>
        </dl>
        {result.overThreshold ? (
          <p className="text-danger mt-3 text-sm" role="alert">
            Fark, işletmenin belirlediği eşiği aşıyor; yöneticiye bildirildi.
          </p>
        ) : difference === 0 ? (
          <p className="text-success mt-3 text-sm">Kasa tam tutuyor.</p>
        ) : null}
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      closeDisabled={busy}
      title="Vardiyayı kapat"
      description="Çekmecedeki nakdi sayın; sistem beklediği tutarla karşılaştıracak."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Vazgeç (Esc)
          </Button>
          <Button loading={busy} disabled={!valid || busy} onClick={submit}>
            Vardiyayı kapat
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Sayılan nakit" required error={error ?? undefined}>
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              ref={amountRef}
              value={amount}
              inputMode="decimal"
              invalid={error !== null}
              onChange={(event) => {
                setAmount(event.target.value.replace(',', '.'));
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || !valid || busy) return;
                event.preventDefault();
                submit();
              }}
            />
          )}
        </Field>
        <Field label="Not">
          {({ id }) => (
            <Textarea
              id={id}
              value={note}
              rows={2}
              maxLength={300}
              onChange={(event) => {
                setNote(event.target.value);
              }}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}
