import type { SalePaymentDraft } from '@shared/ipc-contracts';
import { Banknote, CreditCard, Landmark, NotebookPen, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';

import { PosCoreError, settlePayments } from '@stokk/pos-core';
import { Button, Dialog, Input, formatMoney } from '@stokk/ui';


type Method = SalePaymentDraft['method'];

interface PaymentDialogProps {
  grandTotal: string;
  /** Veresiye için seçili müşteri; yoksa veresiye düğmesi kapalı. */
  customerName: string | null;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (payments: SalePaymentDraft[]) => void;
}

/**
 * Ödeme yöntemleri ve KISAYOL tuşları.
 *
 * Kasada fare yoktur: yöntemi Tab'layarak seçmek 5-9 tuş demekti. Modal açıkken
 * ekranın kendi F1-F10 haritası zaten susuyor (bkz. `sale-screen.tsx`), bu yüzden
 * aynı tuşlar burada yeniden kullanılabiliyor.
 */
const METHODS: { method: Method; label: string; key: string; icon: typeof Banknote }[] = [
  { method: 'CASH', label: 'Nakit', key: 'F1', icon: Banknote },
  { method: 'CARD', label: 'Kart', key: 'F2', icon: CreditCard },
  { method: 'TRANSFER', label: 'Havale', key: 'F3', icon: Landmark },
  { method: 'CREDIT', label: 'Veresiye', key: 'F4', icon: NotebookPen },
];

const METHOD_LABEL: Record<Method, string> = {
  CASH: 'Nakit',
  CARD: 'Kart',
  TRANSFER: 'Havale',
  CREDIT: 'Veresiye',
};

/** Türkiye'de tedavüldeki kâğıt paralar — "tam üstü" düğmesi ayrıca eklenir. */
const QUICK_CASH = [5, 10, 20, 50, 100, 200, 500];

function toMoney(value: number): string {
  return value.toFixed(2);
}

/**
 * Ödeme modalı.
 *
 * Parçalı ödeme kural değil ihtiyaçtır: "100 lira kart, kalanı nakit" bakkalda
 * sıradan. Bu yüzden ödeme tek bir seçim değil, kalan tutar sıfırlanana kadar
 * eklenen bir liste.
 *
 * Para üstü ve toplam denetimi `@stokk/pos-core:settlePayments` ile yapılır —
 * ekranda ikinci bir para hesabı yok. Onay anında main process aynı fonksiyonu
 * yeniden çağırıyor; buradaki hesap kasiyere anında geri bildirim içindir.
 */
export function PaymentDialog({
  grandTotal,
  customerName,
  submitting,
  error,
  onClose,
  onConfirm,
}: PaymentDialogProps): ReactElement {
  const [payments, setPayments] = useState<SalePaymentDraft[]>([]);
  const [amount, setAmount] = useState('');
  const amountRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Modal YALNIZ açıkken mount ediliyor (bkz. sale-screen). State bu yüzden her
  // açılışta zaten temiz başlar; "aç ve sıfırla" effect'ine gerek yok.
  useEffect(() => {
    amountRef.current?.focus();
  }, []);

  const paid = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const remaining = Math.max(0, Number(grandTotal) - paid);

  const settlement = useMemo(() => {
    if (payments.length === 0) return null;
    try {
      return settlePayments(payments, grandTotal);
    } catch (settleError) {
      return settleError instanceof PosCoreError ? settleError : null;
    }
  }, [payments, grandTotal]);

  const complete = settlement !== null && !(settlement instanceof PosCoreError);
  const changeDue = complete ? settlement.changeDue : '0.00';

  const addPayment = useCallback(
    (method: Method, requested?: number): void => {
      if (remaining <= 0) return;
      const entered = requested ?? Number(amount || toMoney(remaining));
      if (!Number.isFinite(entered) || entered <= 0) return;

      // Fişe yazılan tutar hiçbir zaman kalanı aşmaz. Nakitte müşterinin verdiği fazla
      // para `receivedAmount` olarak ayrı taşınır ve para üstüne dönüşür; kart/havalede
      // fazla girmek anlamsız olduğu için kalana kırpılır.
      const applied = Math.min(entered, remaining);
      setPayments((current) => [
        ...current,
        {
          method,
          amount: toMoney(applied),
          ...(method === 'CASH' && entered > applied ? { receivedAmount: toMoney(entered) } : {}),
        },
      ]);
      setAmount('');
      // Kalan varsa odak tutar alanında kalır. Fiş kapandıysa o alan `disabled`
      // olacak; odağın nereye gideceği aşağıdaki effect'te çözülüyor — düğme bu
      // satırda henüz etkin değil (state commit edilmedi), şimdi odaklanamaz.
      if (applied < remaining) amountRef.current?.focus();
    },
    [amount, remaining],
  );

  /**
   * Fiş kapandığı anda odak "Satışı tamamla" düğmesine geçer.
   *
   * Tutar alanı `disabled` olduğu için tarayıcı odağı düşürüyor ve kasiyer
   * Enter'a bastığında hiçbir şey olmuyordu; son adım fareye mahkûm kalırdı.
   */
  useEffect(() => {
    if (complete) confirmRef.current?.focus();
  }, [complete]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const entry = METHODS.find((method) => method.key === event.key);
      if (!entry) return;
      event.preventDefault();
      if (entry.method === 'CREDIT' && customerName === null) return;
      addPayment(entry.method);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [addPayment, customerName]);

  return (
    <Dialog
      open
      onClose={onClose}
      closeDisabled={submitting}
      title="Ödeme"
      description={`Fiş tutarı ${formatMoney(grandTotal)}`}
      className="w-[min(38rem,calc(100vw-2rem))]"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Vazgeç (Esc)
          </Button>
          <Button
            ref={confirmRef}
            loading={submitting}
            disabled={!complete || submitting}
            onClick={() => {
              onConfirm(payments);
            }}
          >
            Satışı tamamla
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Kasiyerin gözünün gittiği tek sayı; ekran okuyucuya da duyurulur. */}
        <div
          role="status"
          aria-live="polite"
          className="bg-surface-sunken rounded-control flex items-baseline justify-between px-4 py-3"
        >
          <span className="text-ink-muted text-sm">{remaining > 0 ? 'Kalan' : 'Para üstü'}</span>
          <span className="text-ink text-3xl font-bold tabular-nums">
            {formatMoney(remaining > 0 ? toMoney(remaining) : changeDue)}
          </span>
        </div>

        <div className="flex gap-2">
          <Input
            ref={amountRef}
            value={amount}
            inputMode="decimal"
            placeholder={toMoney(remaining)}
            aria-label="Ödeme tutarı"
            disabled={submitting || remaining <= 0}
            onChange={(event) => {
              setAmount(event.target.value.replace(',', '.'));
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              addPayment('CASH');
            }}
          />
          <Button
            variant="secondary"
            disabled={remaining <= 0}
            onClick={() => {
              addPayment('CASH', remaining);
            }}
          >
            Tam üstü
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {QUICK_CASH.map((value) => (
            <Button
              key={value}
              variant="secondary"
              disabled={submitting || remaining <= 0}
              onClick={() => {
                addPayment('CASH', value);
              }}
            >
              {value} ₺
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {METHODS.map(({ method, label, key, icon: Icon }) => {
            const creditBlocked = method === 'CREDIT' && customerName === null;
            return (
              <Button
                key={method}
                variant={method === 'CASH' ? 'primary' : 'secondary'}
                disabled={submitting || remaining <= 0 || creditBlocked}
                aria-keyshortcuts={key}
                title={
                  creditBlocked ? 'Veresiye için önce satış ekranından müşteri seçin (F2).' : key
                }
                onClick={() => {
                  addPayment(method);
                }}
              >
                <Icon aria-hidden />
                {label} · {key}
              </Button>
            );
          })}
        </div>

        {payments.length > 0 ? (
          <ul
            className="border-border divide-border divide-y rounded-md border"
            aria-label="Ödemeler"
          >
            {payments.map((payment, index) => (
              <li key={`${payment.method}-${index}`} className="flex items-center gap-2 px-3 py-2">
                <span className="text-ink flex-1 text-sm">{METHOD_LABEL[payment.method]}</span>
                {payment.receivedAmount ? (
                  <span className="text-ink-muted text-xs">
                    alınan {formatMoney(payment.receivedAmount)}
                  </span>
                ) : null}
                <span className="text-ink tabular-nums">{formatMoney(payment.amount)}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Ödemeyi kaldır"
                  disabled={submitting}
                  onClick={() => {
                    setPayments((current) => current.filter((_, i) => i !== index));
                  }}
                >
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}

        {settlement instanceof PosCoreError ? (
          <p className="text-danger text-sm" role="alert">
            {settlement.message}
          </p>
        ) : null}
        {error ? (
          <p className="text-danger text-sm" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
