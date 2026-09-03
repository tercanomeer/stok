'use client';

import { Ban, CheckCircle2, ScanBarcode } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactElement } from 'react';

import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  formatCount,
  formatDateTime,
  formatQuantity,
  Input,
  Spinner,
  useToast,
} from '@stokk/ui';

import { StockTabs } from './stock-tabs';
import {
  useAddCountItem,
  useCancelCount,
  useCompleteCount,
  useStockCount,
} from '../../hooks/use-stock';
import { apiErrorMessage } from '../../lib/api';
import type { StockCountItem } from '../../lib/api-types';
import { differenceTone, quantityDifference } from '../../lib/quantity';
import { ConfirmDialog } from '../common/confirm-dialog';
import { DataTable, type Column } from '../common/data-table';
import { PageHeader } from '../common/page-header';
import { FormBanner } from '../form-banner';

export interface CountDetailProps {
  countId: string;
}

/**
 * Sayım ekranı: barkodla hızlı giriş + canlı fark tablosu.
 *
 * Barkod alanı ODAĞI BIRAKMAZ — okutma, hata, başarı, hepsinden sonra odak geri döner.
 * Kasa/depo ortamında okuyucu klavye taklit eder; odak kaçarsa okutulan kod boşluğa gider.
 */
export function CountDetail({ countId }: CountDetailProps): ReactElement {
  const count = useStockCount(countId);
  const addItem = useAddCountItem();
  const completeCount = useCompleteCount();
  const cancelCount = useCancelCount();
  const router = useRouter();
  const toast = useToast();

  const barcodeInput = useRef<HTMLInputElement>(null);
  const [barcode, setBarcode] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [confirm, setConfirm] = useState<'complete' | 'cancel' | null>(null);

  const status = count.data?.status;
  const inProgress = status === 'IN_PROGRESS';

  // Ekran açılır açılmaz okuyucu hazır olsun.
  useEffect(() => {
    if (inProgress) barcodeInput.current?.focus();
  }, [inProgress]);

  function submitScan(): void {
    const value = barcode.trim();
    if (!value || !inProgress) return;

    addItem.mutate(
      { countId, product: value, quantity: quantity.trim().replace(',', '.') || '1' },
      {
        onSuccess: () => {
          setBarcode('');
          setQuantity('1');
        },
        onError: (error) => {
          toast.error('Okutma başarısız', apiErrorMessage(error));
        },
        // Başarıda da hatada da odak barkoda döner: kasiyer okutmaya devam eder.
        onSettled: () => {
          barcodeInput.current?.focus();
          barcodeInput.current?.select();
        },
      },
    );
  }

  const items = count.data?.items ?? [];
  const differences = items.filter(
    (item) => quantityDifference(item.countedQuantity, item.expectedQuantity) !== '0',
  );

  const columns: Column<StockCountItem>[] = [
    {
      key: 'product',
      header: 'Ürün',
      fixed: true,
      cell: (item) => <span className="text-ink font-medium">{item.product.name}</span>,
    },
    {
      key: 'expected',
      header: 'Sistem',
      numeric: true,
      cell: (item) => formatQuantity(item.expectedQuantity),
    },
    {
      key: 'counted',
      header: 'Sayılan',
      numeric: true,
      cell: (item) => <span className="font-medium">{formatQuantity(item.countedQuantity)}</span>,
    },
    {
      key: 'difference',
      header: 'Fark',
      numeric: true,
      cell: (item) => {
        const difference = quantityDifference(item.countedQuantity, item.expectedQuantity);
        const tone = differenceTone(difference);
        if (tone === 'neutral') return <span className="text-ink-subtle">0</span>;
        return (
          <span
            className={tone === 'success' ? 'text-success font-medium' : 'text-danger font-medium'}
          >
            {tone === 'success' ? '+' : ''}
            {formatQuantity(difference)}
          </span>
        );
      },
    },
  ];

  if (count.isPending) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner label="Sayım yükleniyor" />
      </div>
    );
  }

  if (count.isError) {
    return <FormBanner message={apiErrorMessage(count.error)} />;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Sayım ${count.data.code}`}
        description={
          inProgress
            ? 'Ürünleri okutun. Sayım bitene kadar stok değişmez.'
            : `Sayım ${formatDateTime(count.data.completedAt ?? count.data.startedAt)} tarihinde kapandı.`
        }
        actions={
          inProgress ? (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setConfirm('cancel');
                }}
              >
                <Ban aria-hidden />
                İptal et
              </Button>
              <Button
                onClick={() => {
                  setConfirm('complete');
                }}
              >
                <CheckCircle2 aria-hidden />
                Sayımı tamamla
              </Button>
            </>
          ) : (
            <Badge tone={count.data.status === 'COMPLETED' ? 'success' : 'neutral'}>
              {count.data.status === 'COMPLETED' ? 'Tamamlandı' : 'İptal edildi'}
            </Badge>
          )
        }
      />
      <StockTabs />

      {inProgress ? (
        <Card>
          <CardHeader>
            <CardTitle>Barkod okut</CardTitle>
          </CardHeader>
          <CardBody>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitScan();
              }}
              className="flex flex-wrap items-end gap-3"
            >
              <div className="min-w-64 flex-1">
                <label
                  htmlFor="count-barcode"
                  className="text-ink mb-1.5 block text-sm font-medium"
                >
                  Barkod veya ürün kodu
                </label>
                <div className="relative">
                  <ScanBarcode
                    className="text-ink-subtle pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                    aria-hidden
                  />
                  <Input
                    id="count-barcode"
                    ref={barcodeInput}
                    value={barcode}
                    autoComplete="off"
                    className="tabular pl-9"
                    placeholder="Okutun veya yazıp Enter'a basın"
                    onChange={(e) => {
                      setBarcode(e.target.value);
                    }}
                  />
                </div>
              </div>

              <div className="w-28">
                <label
                  htmlFor="count-quantity"
                  className="text-ink mb-1.5 block text-sm font-medium"
                >
                  Miktar
                </label>
                <Input
                  id="count-quantity"
                  value={quantity}
                  inputMode="decimal"
                  className="tabular"
                  onChange={(e) => {
                    setQuantity(e.target.value);
                  }}
                />
              </div>

              <Button type="submit" loading={addItem.isPending}>
                Ekle
              </Button>
            </form>

            <p className="text-ink-muted mt-3 text-sm">
              Aynı ürün tekrar okutulursa miktar üstüne eklenir.
            </p>
          </CardBody>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2" aria-live="polite">
        <Badge tone="neutral">{formatCount(items.length)} kalem sayıldı</Badge>
        <Badge tone={differences.length > 0 ? 'warning' : 'success'}>
          {formatCount(differences.length)} kalemde fark var
        </Badge>
      </div>

      <DataTable
        columns={columns}
        rows={items}
        rowKey={(item) => item.id}
        loading={false}
        empty={
          <EmptyState
            icon={ScanBarcode}
            title="Henüz kalem yok"
            description="İlk ürünü okutunca fark tablosu burada oluşur."
          />
        }
      />

      <ConfirmDialog
        open={confirm === 'complete'}
        title="Sayımı tamamla"
        description={`${formatCount(differences.length)} kalemdeki fark stoğa tek hareketle yazılacak. Bu işlem geri alınamaz.`}
        confirmLabel="Tamamla"
        loading={completeCount.isPending}
        onConfirm={() => {
          completeCount.mutate(countId, {
            onSuccess: (result) => {
              toast.success(
                'Sayım tamamlandı',
                `${formatCount(result.adjustments)} üründe stok düzeltildi.`,
              );
              setConfirm(null);
            },
            onError: (error) => {
              toast.error('Sayım tamamlanamadı', apiErrorMessage(error));
            },
          });
        }}
        onClose={() => {
          setConfirm(null);
        }}
      />

      <ConfirmDialog
        open={confirm === 'cancel'}
        title="Sayımı iptal et"
        description="Sayılan kalemler kaydedilmez, stok değişmez. Bu işlem geri alınamaz."
        confirmLabel="İptal et"
        destructive
        loading={cancelCount.isPending}
        onConfirm={() => {
          cancelCount.mutate(countId, {
            onSuccess: () => {
              toast.success('Sayım iptal edildi');
              setConfirm(null);
              router.replace('/stock/counts');
            },
            onError: (error) => {
              toast.error('Sayım iptal edilemedi', apiErrorMessage(error));
            },
          });
        }}
        onClose={() => {
          setConfirm(null);
        }}
      />
    </div>
  );
}
