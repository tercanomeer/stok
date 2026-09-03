'use client';

import { ReceiptText } from 'lucide-react';
import Link from 'next/link';
import { useMemo, type ReactElement } from 'react';

import { Badge, Button, EmptyState, formatDateTime, formatMoney, Input, Select } from '@stokk/ui';

import { useUsers } from '../../hooks/use-admin';
import { useListParams } from '../../hooks/use-list-params';
import { usePageClamp } from '../../hooks/use-page-clamp';
import { useSales } from '../../hooks/use-sales';
import { apiErrorMessage } from '../../lib/api';
import type { SaleListRow, SaleStatus } from '../../lib/api-types';
import { PAYMENT_METHOD_LABELS } from '../../lib/finance-labels';
import { dateToIsoEnd, dateToIsoStart, isoToDateInput } from '../../lib/stock-labels';
import { DataTable, type Column } from '../common/data-table';
import { PageHeader } from '../common/page-header';
import { PaginationBar } from '../common/pagination-bar';
import { SearchInput } from '../common/search-input';

const LIST_CONFIG = {
  filterKeys: ['status', 'userId', 'paymentMethod', 'from', 'to'] as const,
};

const STATUS_LABELS: Record<
  SaleStatus,
  { label: string; tone: 'success' | 'neutral' | 'warning' }
> = {
  COMPLETED: { label: 'Tamamlandı', tone: 'success' },
  PARKED: { label: 'Park', tone: 'neutral' },
  CANCELLED: { label: 'İptal', tone: 'neutral' },
  PARTIALLY_RETURNED: { label: 'Kısmi iade', tone: 'warning' },
  RETURNED: { label: 'İade', tone: 'warning' },
};

/** Satış listesi — tarih, kasiyer ve ödeme tipi filtreleri sunucuda uygulanır. */
export function SaleList(): ReactElement {
  const { params, setPage, setLimit, setSearch, setFilter, reset } = useListParams(LIST_CONFIG);
  const sales = useSales(params);
  usePageClamp(sales.data?.meta, setPage);
  const users = useUsers();

  const columns = useMemo<Column<SaleListRow>[]>(
    () => [
      {
        key: 'receiptNo',
        header: 'Fiş no',
        fixed: true,
        cell: (sale) => (
          <Link href={`/sales/${sale.id}`} className="text-ink tabular font-medium hover:underline">
            {sale.receiptNo}
          </Link>
        ),
      },
      {
        key: 'soldAt',
        header: 'Tarih',
        cell: (sale) => <span className="tabular">{formatDateTime(sale.soldAt)}</span>,
      },
      { key: 'user', header: 'Kasiyer', cell: (sale) => sale.user.fullName },
      {
        key: 'contact',
        header: 'Müşteri',
        cell: (sale) =>
          sale.contact ? (
            <Link
              href={`/contacts/${sale.contact.id}`}
              className="text-ink-muted hover:text-ink hover:underline"
            >
              {sale.contact.name}
            </Link>
          ) : (
            '—'
          ),
      },
      {
        key: 'payments',
        header: 'Ödeme',
        cell: (sale) =>
          sale.payments.length === 0
            ? '—'
            : [...new Set(sale.payments.map((p) => PAYMENT_METHOD_LABELS[p.method]))].join(' + '),
      },
      {
        key: 'grandTotal',
        header: 'Tutar',
        numeric: true,
        cell: (sale) => (
          <span
            className={sale.status === 'CANCELLED' ? 'text-ink-subtle line-through' : 'font-medium'}
          >
            {formatMoney(sale.grandTotal)}
          </span>
        ),
      },
      {
        key: 'status',
        header: 'Durum',
        cell: (sale) => (
          <Badge tone={STATUS_LABELS[sale.status].tone}>{STATUS_LABELS[sale.status].label}</Badge>
        ),
      },
    ],
    [],
  );

  const hasFilters = Object.values(params.filters).some(Boolean) || params.search !== '';

  return (
    <div className="space-y-5">
      <PageHeader title="Satışlar" description="Fiş geçmişi, satış detayı ve iade." />

      <div className="flex flex-wrap items-end gap-2">
        <SearchInput
          value={params.search}
          onChange={setSearch}
          placeholder="Fiş no"
          className="min-w-52"
        />

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink font-medium">Kasiyer</span>
          <Select
            className="w-44"
            value={params.filters.userId ?? ''}
            onChange={(e) => {
              setFilter('userId', e.target.value);
            }}
          >
            <option value="">Tüm kasiyerler</option>
            {(users.data ?? []).map((user) => (
              <option key={user.id} value={user.id}>
                {user.fullName}
              </option>
            ))}
          </Select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink font-medium">Ödeme tipi</span>
          <Select
            className="w-40"
            value={params.filters.paymentMethod ?? ''}
            onChange={(e) => {
              setFilter('paymentMethod', e.target.value);
            }}
          >
            <option value="">Tümü</option>
            {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink font-medium">Başlangıç</span>
          <Input
            type="date"
            className="w-40"
            value={isoToDateInput(params.filters.from)}
            onChange={(e) => {
              setFilter('from', dateToIsoStart(e.target.value) ?? '');
            }}
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink font-medium">Bitiş</span>
          <Input
            type="date"
            className="w-40"
            value={isoToDateInput(params.filters.to)}
            onChange={(e) => {
              setFilter('to', dateToIsoEnd(e.target.value) ?? '');
            }}
          />
        </label>

        {hasFilters ? (
          <Button variant="ghost" onClick={reset}>
            Filtreleri temizle
          </Button>
        ) : null}
      </div>

      <DataTable
        columns={columns}
        rows={sales.data?.items ?? []}
        rowKey={(sale) => sale.id}
        loading={sales.isPending}
        error={sales.isError ? apiErrorMessage(sales.error) : null}
        onRetry={() => {
          void sales.refetch();
        }}
        empty={
          <EmptyState
            icon={ReceiptText}
            title="Satış kaydı yok"
            description="Satışlar kasadan (POS) girilir; geçmiş ve iade işlemleri burada görünür."
          />
        }
      />

      <PaginationBar meta={sales.data?.meta} onPageChange={setPage} onLimitChange={setLimit} />
    </div>
  );
}
