'use client';

import { FileText, Receipt } from 'lucide-react';
import Link from 'next/link';
import { useMemo, type ReactElement } from 'react';

import { PERMISSIONS } from '@stokk/types';
import { Badge, EmptyState, formatDate, formatMoney, Select } from '@stokk/ui';

import { useListParams } from '../../hooks/use-list-params';
import { usePageClamp } from '../../hooks/use-page-clamp';
import { usePurchases } from '../../hooks/use-purchases';
import { apiErrorMessage } from '../../lib/api';
import type { PurchaseListItem } from '../../lib/api-types';
import { PURCHASE_STATUS_LABELS } from '../../lib/finance-labels';
import { Can } from '../can';
import { DataTable, type Column } from '../common/data-table';
import { LinkButton } from '../common/link-button';
import { PageHeader } from '../common/page-header';
import { PaginationBar } from '../common/pagination-bar';
import { SearchInput } from '../common/search-input';

const LIST_CONFIG = { filterKeys: ['status', 'contactId'] as const };

const STATUS_FILTERS = [
  { value: '', label: 'Tüm faturalar' },
  { value: 'COMPLETED', label: 'Tamamlanan' },
  { value: 'CANCELLED', label: 'İptal edilen' },
] as const;

/** Alış faturası listesi — tedarikçi, tutar ve durum. */
export function PurchaseList(): ReactElement {
  const { params, setPage, setLimit, setSearch, setFilter } = useListParams(LIST_CONFIG);
  const purchases = usePurchases(params);
  usePageClamp(purchases.data?.meta, setPage);

  const columns = useMemo<Column<PurchaseListItem>[]>(
    () => [
      {
        key: 'invoiceNo',
        header: 'Fatura',
        fixed: true,
        cell: (purchase) => (
          <Link href={`/purchases/${purchase.id}`} className="text-ink font-medium hover:underline">
            {purchase.invoiceNo ?? 'Numarasız'}
          </Link>
        ),
      },
      {
        key: 'contact',
        header: 'Tedarikçi',
        cell: (purchase) => (
          <Link
            href={`/contacts/${purchase.contact.id}`}
            className="text-ink-muted hover:text-ink hover:underline"
          >
            {purchase.contact.name}
          </Link>
        ),
      },
      {
        key: 'invoiceDate',
        header: 'Fatura tarihi',
        cell: (purchase) => <span className="tabular">{formatDate(purchase.invoiceDate)}</span>,
      },
      {
        key: 'grandTotal',
        header: 'Tutar',
        numeric: true,
        cell: (purchase) => (
          <span
            className={
              purchase.status === 'CANCELLED' ? 'text-ink-subtle line-through' : 'font-medium'
            }
          >
            {formatMoney(purchase.grandTotal)}
          </span>
        ),
      },
      {
        key: 'status',
        header: 'Durum',
        cell: (purchase) => (
          <Badge tone={purchase.status === 'CANCELLED' ? 'neutral' : 'success'}>
            {PURCHASE_STATUS_LABELS[purchase.status]}
          </Badge>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Alışlar"
        description="Mal girişi faturaları — stok, maliyet ve tedarikçi borcu buradan işlenir."
        actions={
          <Can permission={PERMISSIONS.PURCHASE_MANAGE}>
            <LinkButton href="/purchases/new">
              <Receipt className="size-4" aria-hidden />
              Yeni alış faturası
            </LinkButton>
          </Can>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={params.search}
          onChange={setSearch}
          placeholder="Fatura no"
          className="min-w-64 flex-1"
        />
        <Select
          className="w-44"
          aria-label="Fatura durumu filtresi"
          value={params.filters.status ?? ''}
          onChange={(e) => {
            setFilter('status', e.target.value);
          }}
        >
          {STATUS_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      <DataTable
        columns={columns}
        rows={purchases.data?.items ?? []}
        rowKey={(purchase) => purchase.id}
        loading={purchases.isPending}
        error={purchases.isError ? apiErrorMessage(purchases.error) : null}
        onRetry={() => {
          void purchases.refetch();
        }}
        empty={
          <EmptyState
            icon={FileText}
            title="Henüz alış faturası yok"
            description="Mal girişini fatura olarak kaydedin; stok, maliyet ve tedarikçi borcu tek seferde işlensin."
          />
        }
      />

      <PaginationBar meta={purchases.data?.meta} onPageChange={setPage} onLimitChange={setLimit} />
    </div>
  );
}
