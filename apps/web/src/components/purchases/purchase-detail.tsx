'use client';

import { Ban, Printer } from 'lucide-react';
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
  formatDate,
  formatDateTime,
  formatMoney,
  formatPercent,
  formatQuantity,
  Spinner,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useToast,
} from '@stokk/ui';

import { useCancelPurchase, usePurchase } from '../../hooks/use-purchases';
import { apiErrorMessage } from '../../lib/api';
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
  const toast = useToast();
  const canCancel = usePermission(PERMISSIONS.PURCHASE_CANCEL);
  const [confirming, setConfirming] = useState(false);

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
