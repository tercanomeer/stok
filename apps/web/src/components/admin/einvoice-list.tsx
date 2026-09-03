'use client';

import { FileCheck2, RefreshCw, Send, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useMemo, useState, type ReactElement } from 'react';

import { PERMISSIONS } from '@stokk/types';
import {
  Badge,
  Button,
  EmptyState,
  formatDateTime,
  formatMoney,
  Select,
  useToast,
} from '@stokk/ui';

import { useEInvoiceAction, useEInvoices } from '../../hooks/use-admin';
import { useListParams } from '../../hooks/use-list-params';
import { usePageClamp } from '../../hooks/use-page-clamp';
import { apiDownload, apiErrorMessage } from '../../lib/api';
import type { EInvoiceRow, EInvoiceStatus } from '../../lib/api-types';
import { usePermission } from '../../lib/permissions';
import { ConfirmDialog } from '../common/confirm-dialog';
import { DataTable, type Column } from '../common/data-table';
import { PageHeader } from '../common/page-header';
import { PaginationBar } from '../common/pagination-bar';

const LIST_CONFIG = { filterKeys: ['status'] as const };

const STATUS: Record<
  EInvoiceStatus,
  { label: string; tone: 'neutral' | 'brand' | 'success' | 'danger' }
> = {
  DRAFT: { label: 'Taslak', tone: 'neutral' },
  SENT: { label: 'Gönderildi', tone: 'brand' },
  ACCEPTED: { label: 'Kabul edildi', tone: 'success' },
  REJECTED: { label: 'Reddedildi', tone: 'danger' },
  CANCELLED: { label: 'İptal', tone: 'neutral' },
};

const TYPE_LABELS = { E_INVOICE: 'e-Fatura', E_ARCHIVE: 'e-Arşiv' } as const;

/**
 * e-Belge listesi ve durum takibi. Akış: DRAFT → SENT → ACCEPTED/REJECTED (→ CANCELLED).
 * Reddedilen belge yeniden gönderilebilir; kabul edilen yalnız iptal edilebilir.
 */
export function EInvoiceList(): ReactElement {
  const { params, setPage, setLimit, setFilter } = useListParams(LIST_CONFIG);
  const invoices = useEInvoices(params);
  usePageClamp(invoices.data?.meta, setPage);
  const send = useEInvoiceAction('send');
  const refresh = useEInvoiceAction('refresh');
  const cancel = useEInvoiceAction('cancel');
  const toast = useToast();
  const canSend = usePermission(PERMISSIONS.EINVOICE_SEND);
  const [pendingCancel, setPendingCancel] = useState<EInvoiceRow | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const downloadPdf = useCallback(
    async (row: EInvoiceRow): Promise<void> => {
      setDownloading(row.id);
      try {
        await apiDownload(`/e-invoices/${row.id}/pdf`, `e-belge-${row.invoiceNo ?? row.id}.pdf`);
      } catch (error) {
        toast.error('PDF indirilemedi', apiErrorMessage(error));
      } finally {
        setDownloading(null);
      }
    },
    [toast],
  );

  const columns = useMemo<Column<EInvoiceRow>[]>(
    () => [
      {
        key: 'invoiceNo',
        header: 'Belge no',
        fixed: true,
        cell: (row) => <span className="tabular font-medium">{row.invoiceNo ?? 'Numarasız'}</span>,
      },
      { key: 'type', header: 'Tür', cell: (row) => TYPE_LABELS[row.type] },
      {
        key: 'sale',
        header: 'Satış',
        cell: (row) =>
          row.saleId ? (
            <Link href={`/sales/${row.saleId}`} className="text-brand hover:underline">
              Fişe git
            </Link>
          ) : (
            '—'
          ),
      },
      {
        key: 'createdAt',
        header: 'Oluşturma',
        cell: (row) => <span className="tabular">{formatDateTime(row.createdAt)}</span>,
      },
      {
        key: 'totalAmount',
        header: 'Tutar',
        numeric: true,
        cell: (row) => formatMoney(row.totalAmount),
      },
      {
        key: 'status',
        header: 'Durum',
        cell: (row) => (
          <div className="flex flex-col gap-1">
            <Badge tone={STATUS[row.status].tone}>{STATUS[row.status].label}</Badge>
            {row.errorMessage ? (
              <span className="text-danger text-xs">{row.errorMessage}</span>
            ) : null}
          </div>
        ),
      },
      {
        key: 'actions',
        header: 'İşlem',
        className: 'w-56',
        cell: (row) => (
          <div className="flex flex-wrap items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              loading={downloading === row.id}
              onClick={() => {
                void downloadPdf(row);
              }}
            >
              PDF
            </Button>
            {canSend && (row.status === 'DRAFT' || row.status === 'REJECTED') ? (
              <Button
                size="sm"
                variant="ghost"
                loading={send.isPending}
                onClick={() => {
                  send.mutate(row.id, {
                    onSuccess: () => {
                      toast.success('Belge gönderildi');
                    },
                    onError: (error) => {
                      toast.error('Gönderilemedi', apiErrorMessage(error));
                    },
                  });
                }}
              >
                <Send aria-hidden />
                Gönder
              </Button>
            ) : null}
            {canSend && row.status === 'SENT' ? (
              <Button
                size="sm"
                variant="ghost"
                loading={refresh.isPending}
                onClick={() => {
                  refresh.mutate(row.id, {
                    onError: (error) => {
                      toast.error('Durum alınamadı', apiErrorMessage(error));
                    },
                  });
                }}
              >
                <RefreshCw aria-hidden />
                Durum
              </Button>
            ) : null}
            {canSend && row.status !== 'CANCELLED' ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setPendingCancel(row);
                }}
              >
                <XCircle aria-hidden />
                İptal
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [canSend, downloading, downloadPdf, send, refresh, toast],
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="e-Fatura"
        description="e-Fatura ve e-Arşiv belgeleri, gönderim durumu ve PDF."
      />

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink font-medium">Durum</span>
          <Select
            className="w-44"
            value={params.filters.status ?? ''}
            onChange={(e) => {
              setFilter('status', e.target.value);
            }}
          >
            <option value="">Tüm belgeler</option>
            {Object.entries(STATUS).map(([value, meta]) => (
              <option key={value} value={value}>
                {meta.label}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <DataTable
        columns={columns}
        rows={invoices.data?.items ?? []}
        rowKey={(row) => row.id}
        loading={invoices.isPending}
        error={invoices.isError ? apiErrorMessage(invoices.error) : null}
        onRetry={() => {
          void invoices.refetch();
        }}
        empty={
          <EmptyState
            icon={FileCheck2}
            title="e-Belge yok"
            description="Satış detayından e-Arşiv/e-Fatura oluşturulduğunda belgeler burada listelenir."
          />
        }
      />

      <PaginationBar meta={invoices.data?.meta} onPageChange={setPage} onLimitChange={setLimit} />

      <ConfirmDialog
        open={pendingCancel !== null}
        title="Belgeyi iptal et"
        description="Entegratörde iptal talebi oluşturulacak. Bu işlem geri alınamaz."
        confirmLabel="İptal et"
        destructive
        loading={cancel.isPending}
        onConfirm={() => {
          if (!pendingCancel) return;
          cancel.mutate(pendingCancel.id, {
            onSuccess: () => {
              toast.success('Belge iptal edildi');
              setPendingCancel(null);
            },
            onError: (error) => {
              toast.error('İptal edilemedi', apiErrorMessage(error));
            },
          });
        }}
        onClose={() => {
          setPendingCancel(null);
        }}
      />
    </div>
  );
}
