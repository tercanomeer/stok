'use client';

import { Ban, Printer, Undo2 } from 'lucide-react';
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

import { ReturnDialog } from './return-dialog';
import { useCancelSale, useSale } from '../../hooks/use-sales';
import { apiErrorMessage } from '../../lib/api';
import { PAYMENT_METHOD_LABELS } from '../../lib/finance-labels';
import { usePermission } from '../../lib/permissions';
import { hasReturnableItems, remainingQuantity, returnedQuantity } from '../../lib/sale-return';
import { ConfirmDialog } from '../common/confirm-dialog';
import { PageHeader } from '../common/page-header';
import { FormBanner } from '../form-banner';

const STATUS_TONE = {
  COMPLETED: 'success',
  PARKED: 'neutral',
  CANCELLED: 'neutral',
  PARTIALLY_RETURNED: 'warning',
  RETURNED: 'warning',
} as const;

const STATUS_LABEL = {
  COMPLETED: 'Tamamlandı',
  PARKED: 'Park edildi',
  CANCELLED: 'İptal edildi',
  PARTIALLY_RETURNED: 'Kısmi iade',
  RETURNED: 'İade edildi',
} as const;

/** Satış detayı + fiş önizleme + iade. Fiş yazdırma tarayıcıdan (ayrı bağımlılık yok). */
export function SaleDetailView({ saleId }: { saleId: string }): ReactElement {
  const sale = useSale(saleId);
  const cancelSale = useCancelSale();
  const toast = useToast();
  const canReturn = usePermission(PERMISSIONS.SALE_RETURN);
  const canCancel = usePermission(PERMISSIONS.SALE_CANCEL);
  const [returning, setReturning] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  if (sale.isPending) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner label="Satış yükleniyor" />
      </div>
    );
  }
  if (sale.isError) return <FormBanner message={apiErrorMessage(sale.error)} />;

  const data = sale.data;
  const returnable =
    (data.status === 'COMPLETED' || data.status === 'PARTIALLY_RETURNED') &&
    hasReturnableItems(data.items);

  return (
    <div className="space-y-5">
      <div className="no-print">
        <PageHeader
          title={`Fiş ${data.receiptNo}`}
          description={`${formatDateTime(data.soldAt)} · ${data.user.fullName}`}
          actions={
            <>
              <Button
                variant="outline"
                onClick={() => {
                  window.print();
                }}
              >
                <Printer aria-hidden />
                Fişi yazdır
              </Button>
              {canReturn && returnable ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setReturning(true);
                  }}
                >
                  <Undo2 aria-hidden />
                  İade
                </Button>
              ) : null}
              {canCancel && data.status === 'COMPLETED' ? (
                <Button
                  variant="danger"
                  onClick={() => {
                    setConfirmingCancel(true);
                  }}
                >
                  <Ban aria-hidden />
                  Satışı iptal et
                </Button>
              ) : null}
            </>
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONE[data.status]}>{STATUS_LABEL[data.status]}</Badge>
        {data.contact ? (
          <Link
            href={`/contacts/${data.contact.id}`}
            className="text-brand text-sm hover:underline"
          >
            {data.contact.name}
          </Link>
        ) : null}
        {data.clientSaleId ? (
          <span className="text-ink-subtle text-xs">Offline satış · {data.clientSaleId}</span>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Kalemler</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="border-border rounded-control overflow-hidden border">
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Ürün</TH>
                  <TH numeric>Miktar</TH>
                  <TH numeric>Birim fiyat</TH>
                  <TH numeric>İndirim</TH>
                  <TH numeric>KDV</TH>
                  <TH numeric>Satır toplamı</TH>
                  <TH numeric>İade</TH>
                </TR>
              </THead>
              <TBody>
                {data.items.map((item) => {
                  const returned = returnedQuantity(item);
                  return (
                    <TR key={item.id}>
                      <TD>
                        <Link
                          href={`/products/${item.productId}`}
                          className="text-ink font-medium hover:underline"
                        >
                          {item.productName}
                        </Link>
                      </TD>
                      <TD numeric>{formatQuantity(item.quantity)}</TD>
                      <TD numeric>{formatMoney(item.unitPrice)}</TD>
                      <TD numeric>
                        {Number.parseFloat(item.discountRate) > 0
                          ? formatPercent(item.discountRate)
                          : '—'}
                      </TD>
                      <TD numeric>
                        {formatMoney(item.vatAmount)}
                        <span className="text-ink-subtle ml-1 text-xs">
                          {formatPercent(item.vatRate, 0)}
                        </span>
                      </TD>
                      <TD numeric className="font-medium">
                        {formatMoney(item.lineTotal)}
                      </TD>
                      <TD numeric>
                        {Number.parseFloat(returned) > 0 ? (
                          <span className="text-warning">
                            {formatQuantity(returned)}
                            <span className="text-ink-subtle ml-1 text-xs">
                              kalan {formatQuantity(remainingQuantity(item))}
                            </span>
                          </span>
                        ) : (
                          '—'
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Ödemeler</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="space-y-2 text-sm">
              {data.payments.map((payment) => (
                <li key={payment.id} className="flex justify-between">
                  <span className="text-ink-muted">{PAYMENT_METHOD_LABELS[payment.method]}</span>
                  <span className="tabular">{formatMoney(payment.amount)}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>KDV kırılımı</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="space-y-2 text-sm">
              {data.vatBreakdown.map((entry) => (
                <li key={entry.vatRate} className="flex justify-between">
                  <span className="text-ink-muted">
                    {formatPercent(entry.vatRate, 0)} · matrah {formatMoney(entry.base)}
                  </span>
                  <span className="tabular">{formatMoney(entry.vatAmount)}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Toplam</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-muted">Ara toplam</dt>
                <dd className="tabular">{formatMoney(data.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">İndirim</dt>
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
          </CardBody>
        </Card>
      </div>

      {data.returns.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>İadeler</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="space-y-2 text-sm">
              {data.returns.map((entry) => (
                <li key={entry.id} className="flex flex-wrap justify-between gap-2">
                  <span className="text-ink-muted">
                    <span className="tabular">{entry.returnNo}</span> ·{' '}
                    {formatDateTime(entry.createdAt)} · {PAYMENT_METHOD_LABELS[entry.refundMethod]}
                  </span>
                  <span className="tabular text-warning font-medium">
                    {formatMoney(entry.totalAmount)}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <ReturnDialog
        sale={returning ? data : null}
        onClose={() => {
          setReturning(false);
        }}
      />

      <ConfirmDialog
        open={confirmingCancel}
        title="Satışı iptal et"
        description="Stok geri alınacak, ödeme kayıtları ve varsa cari borcu geri sarılacak. Bu işlem geri alınamaz ve yalnız vardiya kapanmadan yapılabilir."
        confirmLabel="İptal et"
        destructive
        loading={cancelSale.isPending}
        onConfirm={() => {
          cancelSale.mutate(saleId, {
            onSuccess: () => {
              toast.success('Satış iptal edildi');
              setConfirmingCancel(false);
            },
            onError: (error) => {
              toast.error('Satış iptal edilemedi', apiErrorMessage(error));
            },
          });
        }}
        onClose={() => {
          setConfirmingCancel(false);
        }}
      />
    </div>
  );
}
