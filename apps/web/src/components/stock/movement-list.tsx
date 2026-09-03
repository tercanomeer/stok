'use client';

import { History } from 'lucide-react';
import Link from 'next/link';
import { useMemo, type ReactElement } from 'react';

import {
  Badge,
  Button,
  EmptyState,
  formatDateTime,
  formatQuantity,
  Input,
  Select,
} from '@stokk/ui';

import { StockTabs } from './stock-tabs';
import { useListParams } from '../../hooks/use-list-params';
import { usePageClamp } from '../../hooks/use-page-clamp';
import { useProduct } from '../../hooks/use-products';
import { useStockMovements } from '../../hooks/use-stock';
import { apiErrorMessage } from '../../lib/api';
import type { StockMovement } from '../../lib/api-types';
import {
  dateToIsoEnd,
  dateToIsoStart,
  isoToDateInput,
  MOVEMENT_TYPE_LABELS,
  MOVEMENT_TYPES,
} from '../../lib/stock-labels';
import { DataTable, type Column } from '../common/data-table';
import { PageHeader } from '../common/page-header';
import { PaginationBar } from '../common/pagination-bar';

const LIST_CONFIG = {
  filterKeys: ['productId', 'type', 'from', 'to'] as const,
};

/** Girişler yeşil, çıkışlar kırmızı — işaret miktarın kendisinde. */
function movementTone(movement: StockMovement): 'success' | 'danger' | 'neutral' {
  const quantity = Number.parseFloat(movement.quantity);
  if (quantity > 0) return 'success';
  if (quantity < 0) return 'danger';
  return 'neutral';
}

/** Stok hareket geçmişi — ürün, tip ve tarih aralığı filtreli, sayfalı. */
export function MovementList(): ReactElement {
  const { params, setPage, setLimit, setSort, setFilter, reset } = useListParams(LIST_CONFIG);
  const movements = useStockMovements(params);
  usePageClamp(movements.data?.meta, setPage);
  const productFilter = useProduct(params.filters.productId);

  const columns = useMemo<Column<StockMovement>[]>(
    () => [
      {
        key: 'createdAt',
        header: 'Tarih',
        fixed: true,
        cell: (movement) => (
          <span className="tabular text-ink-muted">{formatDateTime(movement.createdAt)}</span>
        ),
      },
      {
        key: 'product',
        header: 'Ürün',
        cell: (movement) => (
          <Link
            href={`/products/${movement.productId}`}
            className="text-ink font-medium hover:underline"
          >
            {movement.product.name}
          </Link>
        ),
      },
      {
        key: 'type',
        header: 'Tip',
        cell: (movement) => (
          <Badge tone={movementTone(movement)}>{MOVEMENT_TYPE_LABELS[movement.type]}</Badge>
        ),
      },
      {
        key: 'quantity',
        header: 'Miktar',
        numeric: true,
        cell: (movement) => {
          const tone = movementTone(movement);
          const sign = tone === 'success' ? '+' : '';
          return (
            <span
              className={
                tone === 'success'
                  ? 'text-success font-medium'
                  : tone === 'danger'
                    ? 'text-danger font-medium'
                    : undefined
              }
            >
              {sign}
              {formatQuantity(movement.quantity)}
            </span>
          );
        },
      },
      {
        key: 'balanceAfter',
        header: 'Kalan',
        numeric: true,
        cell: (movement) => formatQuantity(movement.balanceAfter),
      },
      {
        key: 'reason',
        header: 'Açıklama',
        cell: (movement) => movement.reason ?? '—',
      },
    ],
    [],
  );

  const hasFilters = Object.values(params.filters).some(Boolean);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Stok hareketleri"
        description="Her giriş ve çıkış defterde: satış, alış, sayım farkı, fire, düzeltme."
      />
      <StockTabs />

      <div className="flex flex-wrap items-end gap-2">
        {params.filters.productId ? (
          <Badge tone="brand">
            Ürün: {productFilter.data?.name ?? '…'}
            <button
              type="button"
              aria-label="Ürün filtresini kaldır"
              onClick={() => {
                setFilter('productId', '');
              }}
              className="ml-1 underline"
            >
              kaldır
            </button>
          </Badge>
        ) : null}

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink font-medium">Hareket tipi</span>
          <Select
            className="w-48"
            value={params.filters.type ?? ''}
            onChange={(e) => {
              setFilter('type', e.target.value);
            }}
          >
            <option value="">Tüm hareketler</option>
            {MOVEMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {MOVEMENT_TYPE_LABELS[type]}
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
        rows={movements.data?.items ?? []}
        rowKey={(movement) => movement.id}
        loading={movements.isPending}
        error={movements.isError ? apiErrorMessage(movements.error) : null}
        onRetry={() => {
          void movements.refetch();
        }}
        sort={params.sort}
        onSortChange={setSort}
        empty={
          <EmptyState
            icon={History}
            title="Hareket yok"
            description="Seçilen filtrelerde stok hareketi bulunamadı."
          />
        }
      />

      <PaginationBar meta={movements.data?.meta} onPageChange={setPage} onLimitChange={setLimit} />
    </div>
  );
}
