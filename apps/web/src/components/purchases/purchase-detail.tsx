'use client';

import { Ban, PencilLine, Printer } from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactElement } from 'react';

import { PERMISSIONS } from '@stokk/types';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Dialog,
  Field,
  formatDate,
  formatDateTime,
  formatMoney,
  formatPercent,
  formatQuantity,
  Input,
  Spinner,
  Table,
  TBody,
  TD,
  TH,
  THead,
  Textarea,
  TR,
  useToast,
} from '@stokk/ui';

import { useCancelPurchase, usePurchase, useUpdatePurchase } from '../../hooks/use-purchases';
import { apiErrorMessage } from '../../lib/api';
import type { PurchaseDetail } from '../../lib/api-types';
import { PURCHASE_STATUS_LABELS } from '../../lib/finance-labels';
import { addMoney } from '../../lib/money-display';
import { usePermission } from '../../lib/permissions';
import { ConfirmDialog } from '../common/confirm-dialog';
import { PageHeader } from '../common/page-header';
import { FormBanner } from '../form-banner';

/**
 * Alış faturası detayı. İPTAL geri alınamaz: stok girişi geri alınır, ortalama maliyet
 * geri sarılır ve tedarikçi borcu düşer — hepsi sunucuda tek transaction'da.
 */
export function PurchaseDetail({ purchaseId }: { purchaseId: string }): ReactElement {
  const purchase = usePurchase(purchaseId);
  const cancel = useCancelPurchase();
  const update = useUpdatePurchase();
  const toast = useToast();
  const canCancel = usePermission(PERMISSIONS.PURCHASE_CANCEL);
  const canManage = usePermission(PERMISSIONS.PURCHASE_MANAGE);
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);

  if (purchase.isPending) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner label="Fatura yükleniyor" />
      </div>
    );
  }
  if (purchase.isError) return <FormBanner message={apiErrorMessage(purchase.error)} />;

  const data = purchase.data;
  const cancelled = data.status === 'CANCELLED';

  return (
    <div className="space-y-5">
      <div className="no-print">
        <PageHeader
          title={data.invoiceNo ? `Fatura ${data.invoiceNo}` : 'Alış faturası'}
          description={
            <>
              <Link href={`/contacts/${data.contact.id}`} className="hover:underline">
                {data.contact.name}
              </Link>
              {` · ${formatDate(data.invoiceDate)}`}
            </>
          }
          actions={
            <>
              <Button
                variant="outline"
                onClick={() => {
                  window.print();
                }}
              >
                <Printer aria-hidden />
                Yazdır / PDF
              </Button>
              {canManage && !cancelled ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditing(true);
                  }}
                >
                  <PencilLine aria-hidden />
                  Belgeyi düzenle
                </Button>
              ) : null}
              {canCancel && !cancelled ? (
                <Button
                  variant="danger"
                  onClick={() => {
                    setConfirming(true);
                  }}
                >
                  <Ban aria-hidden />
                  Faturayı iptal et
                </Button>
              ) : null}
            </>
          }
        />
      </div>

      {cancelled ? (
        <div
          role="status"
          className="rounded-card border-border bg-surface-sunken text-ink-muted border px-4 py-3 text-sm"
        >
          Bu fatura {data.cancelledAt ? formatDateTime(data.cancelledAt) : ''} tarihinde iptal
          edildi. Stok girişi ve tedarikçi borcu geri alındı.
        </div>
      ) : null}

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Kalemler</CardTitle>
          <Badge tone={cancelled ? 'neutral' : 'success'}>
            {PURCHASE_STATUS_LABELS[data.status]}
          </Badge>
        </CardHeader>
        <CardBody>
          <div className="border-border rounded-control overflow-hidden border">
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Ürün</TH>
                  <TH numeric>Miktar</TH>
                  <TH numeric>Birim fiyat</TH>
                  <TH numeric>İskonto</TH>
                  <TH numeric>Matrah</TH>
                  <TH numeric>KDV</TH>
                  <TH numeric>Satır toplamı</TH>
                </TR>
              </THead>
              <TBody>
                {data.items.map((item) => (
                  <TR key={item.id}>
                    <TD>
                      <Link
                        href={`/products/${item.productId}`}
                        className="text-ink font-medium hover:underline"
                      >
                        {item.product.name}
                      </Link>
                    </TD>
                    <TD numeric>{formatQuantity(item.quantity)}</TD>
                    <TD numeric>{formatMoney(item.unitPrice)}</TD>
                    <TD numeric>
                      {Number.parseFloat(item.discountRate) > 0
                        ? formatPercent(item.discountRate)
                        : '—'}
                    </TD>
                    <TD numeric>{formatMoney(item.lineTotal)}</TD>
                    <TD numeric>
                      {formatMoney(item.vatAmount)}
                      <span className="text-ink-subtle ml-1 text-xs">
                        {formatPercent(item.vatRate, 0)}
                      </span>
                    </TD>
                    <TD numeric className="font-medium">
                      {formatMoney(addMoney(item.lineTotal, item.vatAmount))}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </CardBody>
      </Card>

      <div className="flex flex-wrap items-start justify-between gap-4">
        {data.note ? (
          <p className="text-ink-muted max-w-md text-sm">
            <span className="text-ink font-medium">Not: </span>
            {data.note}
          </p>
        ) : (
          <span />
        )}

        <dl className="rounded-card border-border bg-surface-raised min-w-72 space-y-1 border p-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-muted">Ara toplam (KDV hariç)</dt>
            <dd className="tabular">{formatMoney(data.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-muted">İskonto</dt>
            <dd className="tabular">{formatMoney(data.discountTotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-muted">KDV</dt>
            <dd className="tabular">{formatMoney(data.vatTotal)}</dd>
          </div>
          <div className="border-border mt-2 flex justify-between border-t pt-2 text-base font-semibold">
            <dt>Genel toplam</dt>
            <dd className="tabular">{formatMoney(data.grandTotal)}</dd>
          </div>
        </dl>
      </div>

      <PurchaseHeaderDialog
        open={editing}
        purchase={data}
        loading={update.isPending}
        error={update.error}
        onClose={() => {
          setEditing(false);
        }}
        onSubmit={(body) => {
          update.mutate(
            { id: purchaseId, body },
            {
              onSuccess: () => {
                toast.success('Fatura bilgileri güncellendi');
                setEditing(false);
              },
              onError: (error) => {
                toast.error('Güncellenemedi', apiErrorMessage(error));
              },
            },
          );
        }}
      />

      <ConfirmDialog
        open={confirming}
        title="Faturayı iptal et"
        description="Stok girişi geri alınacak, ortalama maliyet geri sarılacak ve tedarikçi borcu düşecek. Bu işlem geri alınamaz."
        confirmLabel="İptal et"
        destructive
        loading={cancel.isPending}
        onConfirm={() => {
          cancel.mutate(purchaseId, {
            onSuccess: () => {
              toast.success('Fatura iptal edildi');
              setConfirming(false);
            },
            onError: (error) => {
              toast.error('Fatura iptal edilemedi', apiErrorMessage(error));
            },
          });
        }}
        onClose={() => {
          setConfirming(false);
        }}
      />
    </div>
  );
}

/** `<input type="date">` için yerel gün. */
function toDateInput(iso: string): string {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

/**
 * Fatura BELGE bilgileri (no / tarih / not). Kalemler burada düzenlenmez:
 * kaydedilirken stok, ortalama maliyet ve tedarikçi borcu işlendi; kalem
 * değişikliği bu üçünü geri sarmayı gerektirir. Kalem hatası faturayı iptal edip
 * yeniden keserek düzeltilir — sunucu da kalem güncellemesini kabul etmiyor.
 */
function PurchaseHeaderDialog({
  open,
  purchase,
  loading,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  purchase: PurchaseDetail;
  loading: boolean;
  error: Error | null;
  onClose: () => void;
  onSubmit: (body: { invoiceNo: string | null; invoiceDate: string; note: string | null }) => void;
}): ReactElement {
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [note, setNote] = useState('');

  // Dialog açılışında forma faturanın güncel değerleri yüklenir (render sırasında,
  // effect'te değil — effect'te setState zincirleme render üretir).
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setInvoiceNo(purchase.invoiceNo ?? '');
      setInvoiceDate(toDateInput(purchase.invoiceDate));
      setNote(purchase.note ?? '');
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Fatura bilgilerini düzenle"
      description={purchase.contact.name}
      closeDisabled={loading}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Vazgeç
          </Button>
          <Button
            loading={loading}
            disabled={invoiceDate === ''}
            onClick={() => {
              onSubmit({
                invoiceNo: invoiceNo.trim() ? invoiceNo.trim() : null,
                invoiceDate: new Date(`${invoiceDate}T00:00:00`).toISOString(),
                note: note.trim() ? note.trim() : null,
              });
            }}
          >
            Kaydet
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <FormBanner message={apiErrorMessage(error)} /> : null}

        <p className="text-ink-muted text-sm">
          Yalnız belge bilgileri değişir.{' '}
          <strong className="text-ink">Kalemler, miktarlar ve fiyatlar düzenlenemez</strong> —
          bunlar kaydedilirken stok, maliyet ve tedarikçi borcu işlendi. Kalem hatası için faturayı
          iptal edip yeniden kesin.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Fatura no">
            {({ id }) => (
              <Input
                id={id}
                autoFocus
                className="tabular"
                value={invoiceNo}
                onChange={(e) => {
                  setInvoiceNo(e.target.value);
                }}
              />
            )}
          </Field>
          <Field label="Fatura tarihi" required>
            {({ id }) => (
              <Input
                id={id}
                type="date"
                value={invoiceDate}
                onChange={(e) => {
                  setInvoiceDate(e.target.value);
                }}
              />
            )}
          </Field>
          <Field label="Not" className="sm:col-span-2">
            {({ id }) => (
              <Textarea
                id={id}
                rows={2}
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                }}
              />
            )}
          </Field>
        </div>
      </div>
    </Dialog>
  );
}
