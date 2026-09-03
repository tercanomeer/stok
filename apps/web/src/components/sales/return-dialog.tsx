'use client';

import { useState, type ReactElement } from 'react';

import { calculateRefundAmount } from '@stokk/pos-core';
import {
  Button,
  Dialog,
  Field,
  formatMoney,
  formatQuantity,
  Input,
  Select,
  Table,
  TBody,
  TD,
  TH,
  THead,
  Textarea,
  TR,
  useToast,
} from '@stokk/ui';

import { useCreateReturn } from '../../hooks/use-sales';
import { apiErrorMessage } from '../../lib/api';
import type { PaymentMethod, SaleDetail } from '../../lib/api-types';
import { toDecimalString } from '../../lib/catalog-schemas';
import { PAYMENT_METHOD_LABELS } from '../../lib/finance-labels';
import { addMoney } from '../../lib/money-display';
import { exceedsRemaining, remainingQuantity } from '../../lib/sale-return';
import { FormBanner } from '../form-banner';

export interface ReturnDialogProps {
  sale: SaleDetail | null;
  onClose: () => void;
}

/**
 * İade: fiş → kalem seç → sebep → onay.
 *
 * Hata maliyeti yüksek bir akış (para geri veriliyor, stok geri giriyor), bu yüzden:
 * kalan iade edilebilir miktar her satırda yazılı, fazlası satır bazında engelli,
 * iade tutarı girildikçe canlı hesaplanıyor ve sebep zorunlu. Nihai doğrulama
 * sunucuda (RETURN_EXCEEDS_SOLD) — ekran yalnız önden uyarır.
 */
export function ReturnDialog({ sale, onClose }: ReturnDialogProps): ReactElement {
  const createReturn = useCreateReturn();
  const toast = useToast();
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>('CASH');
  const [reason, setReason] = useState('');
  const [reasonTouched, setReasonTouched] = useState(false);

  // Başka bir fişe geçildiğinde form sıfırlanır. React'in "prop değişince state'i
  // ayarla" deseni: effect değil, render sırasında — effect'te setState zincirleme
  // render üretir.
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);
  const saleId = sale?.id ?? null;
  if (saleId !== lastSaleId) {
    setLastSaleId(saleId);
    setQuantities({});
    setRefundMethod(sale?.payments[0]?.method ?? 'CASH');
    setReason('');
    setReasonTouched(false);
  }

  const items = sale?.items ?? [];
  const returnable = items.filter((item) => Number.parseFloat(remainingQuantity(item)) > 0);

  const lines = returnable
    .map((item) => ({ item, raw: quantities[item.id] ?? '' }))
    .filter((line) => line.raw.trim() !== '')
    .map((line) => ({
      ...line,
      quantity: toDecimalString(line.raw),
      invalid:
        !(Number.parseFloat(toDecimalString(line.raw)) > 0) ||
        exceedsRemaining(line.item, toDecimalString(line.raw)),
    }));

  const validLines = lines.filter((line) => !line.invalid);
  // İade tutarı ÖDENEN satır tutarından oranlanır (pos-core). Ham `unitPrice`
  // indirim öncesidir; onunla hesaplamak indirimli satışta fazla ödeme gösterir
  // ve sunucunun yazacağı tutarla ayrışırdı — ikisi de aynı fonksiyonu çağırır.
  const refundTotal = validLines.reduce(
    (total, line) =>
      addMoney(
        total,
        calculateRefundAmount(line.item.lineTotal, line.item.quantity, line.quantity),
      ),
    '0.00',
  );

  const blockReason =
    lines.length === 0
      ? 'İade edilecek kalem ve miktar girin.'
      : lines.some((line) => line.invalid)
        ? 'Bazı satırlarda miktar geçersiz veya kalan iadeyi aşıyor.'
        : reason.trim() === ''
          ? 'İade sebebi zorunlu.'
          : null;

  function submit(): void {
    if (!sale || blockReason) {
      setReasonTouched(true);
      return;
    }
    createReturn.mutate(
      {
        saleId: sale.id,
        refundMethod,
        reason: reason.trim(),
        items: validLines.map((line) => ({
          saleItemId: line.item.id,
          quantity: line.quantity,
        })),
      },
      {
        onSuccess: () => {
          toast.success('İade kaydedildi', formatMoney(refundTotal));
          onClose();
        },
      },
    );
  }

  return (
    <Dialog
      open={sale !== null}
      onClose={onClose}
      title="İade"
      description={sale ? `Fiş ${sale.receiptNo}` : undefined}
      closeDisabled={createReturn.isPending}
      className="w-[min(48rem,calc(100vw-2rem))]"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={createReturn.isPending}>
            Vazgeç
          </Button>
          <Button
            variant="danger"
            loading={createReturn.isPending}
            disabled={blockReason !== null}
            onClick={submit}
          >
            {formatMoney(refundTotal)} iade et
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {createReturn.isError ? <FormBanner message={apiErrorMessage(createReturn.error)} /> : null}

        {returnable.length === 0 ? (
          <p className="text-ink-muted text-sm">
            Bu fişte iade edilebilecek kalem kalmadı — tüm kalemler daha önce iade edilmiş.
          </p>
        ) : (
          <>
            <div className="border-border rounded-control overflow-hidden border">
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH>Ürün</TH>
                    <TH numeric>Satılan</TH>
                    <TH numeric>Kalan iade</TH>
                    <TH numeric>Birim fiyat</TH>
                    <TH numeric>İade miktarı</TH>
                  </TR>
                </THead>
                <TBody>
                  {returnable.map((item) => {
                    const raw = quantities[item.id] ?? '';
                    const invalid =
                      raw.trim() !== '' &&
                      (!(Number.parseFloat(toDecimalString(raw)) > 0) ||
                        exceedsRemaining(item, toDecimalString(raw)));
                    return (
                      <TR key={item.id} className={invalid ? 'bg-danger-weak/40' : undefined}>
                        <TD>
                          <span className="text-ink font-medium">{item.productName}</span>
                          {invalid ? (
                            <span className="text-danger block text-xs" role="alert">
                              En fazla {formatQuantity(remainingQuantity(item))} iade edilebilir.
                            </span>
                          ) : null}
                        </TD>
                        <TD numeric>{formatQuantity(item.quantity)}</TD>
                        <TD numeric className="text-ink-muted">
                          {formatQuantity(remainingQuantity(item))}
                        </TD>
                        <TD numeric>{formatMoney(item.unitPrice)}</TD>
                        <TD numeric>
                          <Input
                            className="tabular h-9 w-24 text-right"
                            inputMode="decimal"
                            invalid={invalid}
                            aria-label={`${item.productName} iade miktarı`}
                            value={raw}
                            onChange={(e) => {
                              setQuantities((prev) => ({ ...prev, [item.id]: e.target.value }));
                            }}
                          />
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="İade yöntemi" required>
                {({ id }) => (
                  <Select
                    id={id}
                    value={refundMethod}
                    onChange={(e) => {
                      setRefundMethod(e.target.value as PaymentMethod);
                    }}
                  >
                    {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field
                label="İade sebebi"
                required
                error={reasonTouched && reason.trim() === '' ? 'İade sebebi zorunlu.' : undefined}
                className="sm:col-span-2"
              >
                {({ id, describedBy }) => (
                  <Textarea
                    id={id}
                    rows={2}
                    aria-describedby={describedBy}
                    invalid={reasonTouched && reason.trim() === ''}
                    value={reason}
                    onChange={(e) => {
                      setReason(e.target.value);
                    }}
                    onBlur={() => {
                      setReasonTouched(true);
                    }}
                  />
                )}
              </Field>
            </div>

            {blockReason ? (
              <p className="text-warning text-sm" role="status">
                {blockReason}
              </p>
            ) : null}
          </>
        )}
      </div>
    </Dialog>
  );
}
