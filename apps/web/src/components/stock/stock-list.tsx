'use client';

import { PackageMinus, SlidersHorizontal, Warehouse } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, type ReactElement } from 'react';

import { PERMISSIONS } from '@stokk/types';
import { Badge, Button, EmptyState, formatQuantity, Select } from '@stokk/ui';

import { AdjustDialog } from './adjust-dialog';
import { LowStockBanner } from './low-stock-banner';
import { StockTabs } from './stock-tabs';
import { WasteDialog } from './waste-dialog';
import { useUnits } from '../../hooks/use-catalog';
import { useListParams } from '../../hooks/use-list-params';
import { usePageClamp } from '../../hooks/use-page-clamp';
import { useProducts } from '../../hooks/use-products';
import { useLowStock } from '../../hooks/use-stock';
import { apiErrorMessage } from '../../lib/api';
import type { Product } from '../../lib/api-types';
import { usePermission } from '../../lib/permissions';
import { hasCriticalLevel, isLowStock, isOutOfStock } from '../../lib/stock-status';
import { DataTable, type Column } from '../common/data-table';
import { PageHeader } from '../common/page-header';
import { PaginationBar } from '../common/pagination-bar';
import { SearchInput } from '../common/search-input';

const LIST_CONFIG = {
  filterKeys: ['stock', 'categoryId'] as const,
  defaultSort: 'name:asc',
};

const STOCK_FILTERS = [
  { value: '', label: 'Tüm ürünler' },
  { value: 'low', label: 'Kritik seviyede' },
  { value: 'out', label: 'Stoğu biten' },
  { value: 'active', label: 'Yalnız aktif' },
] as const;

/**
 * Stok durumu ekranı. Liste ürün ucundan gelir (stok, kritik seviye ve birim orada);
 * kritik bandı ayrı `/stock/low` ucundan — o uç sıralamayı kritikliğe göre yapar.
 */
export function StockList(): ReactElement {
  const { params, setPage, setLimit, setSearch, setSort, setFilter } = useListParams(LIST_CONFIG);
  const products = useProducts(params);
  usePageClamp(products.data?.meta, setPage);
  const lowStock = useLowStock();
  const units = useUnits();
  const canWaste = usePermission(PERMISSIONS.STOCK_WASTE);
  const canAdjust = usePermission(PERMISSIONS.STOCK_ADJUST);

  const [wasteTarget, setWasteTarget] = useState<Product | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<Product | null>(null);

  const unitAbbr = useMemo(
    () => new Map((units.data ?? []).map((unit) => [unit.id, unit.abbreviation])),
    [units.data],
  );

  const columns = useMemo<Column<Product>[]>(() => {
    const base: Column<Product>[] = [
      {
        key: 'name',
        header: 'Ürün',
        sortField: 'name',
        fixed: true,
        cell: (product) => (
          <Link href={`/products/${product.id}`} className="text-ink font-medium hover:underline">
            {product.name}
          </Link>
        ),
      },
      {
        key: 'stockQuantity',
        header: 'Stok',
        sortField: 'stockQuantity',
        numeric: true,
        cell: (product) =>
          product.trackStock ? (
            <span className={isLowStock(product) ? 'text-warning font-medium' : undefined}>
              {formatQuantity(product.stockQuantity)} {unitAbbr.get(product.unitId) ?? ''}
            </span>
          ) : (
            <span className="text-ink-subtle">takipsiz</span>
          ),
      },
      {
        key: 'criticalLevel',
        header: 'Kritik seviye',
        numeric: true,
        cell: (product) =>
          hasCriticalLevel(product) ? formatQuantity(product.criticalLevel) : '—',
      },
      {
        key: 'status',
        header: 'Durum',
        cell: (product) =>
          !product.trackStock ? (
            <Badge tone="neutral">Takipsiz</Badge>
          ) : isOutOfStock(product) ? (
            <Badge tone="danger">Tükendi</Badge>
          ) : isLowStock(product) ? (
            <Badge tone="warning">Kritik</Badge>
          ) : (
            <Badge tone="success">Yeterli</Badge>
          ),
      },
      {
        key: 'movements',
        header: 'Hareket',
        cell: (product) => (
          <Link
            href={`/stock/movements?productId=${product.id}`}
            className="text-brand text-sm hover:underline"
          >
            Geçmiş
          </Link>
        ),
      },
    ];

    if (!canWaste && !canAdjust) return base;

    return [
      ...base,
      {
        key: 'actions',
        header: 'İşlem',
        className: 'w-40',
        cell: (product) => (
          <div className="flex items-center gap-1">
            {canWaste ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={!product.trackStock}
                onClick={() => {
                  setWasteTarget(product);
                }}
              >
                <PackageMinus aria-hidden />
                Fire
              </Button>
            ) : null}
            {canAdjust ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={!product.trackStock}
                onClick={() => {
                  setAdjustTarget(product);
                }}
              >
                <SlidersHorizontal aria-hidden />
                Düzelt
              </Button>
            ) : null}
          </div>
        ),
      },
    ];
  }, [unitAbbr, canWaste, canAdjust]);

  return (
    <div className="space-y-5">
      <PageHeader title="Stok" description="Anlık stok durumu, fire ve düzeltme." />
      <StockTabs />

      <LowStockBanner rows={lowStock.data} />

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={params.search}
          onChange={setSearch}
          placeholder="Ürün adı, kod veya barkod"
          className="min-w-64 flex-1"
        />
        <Select
          className="w-44"
          aria-label="Stok durumu filtresi"
          value={params.filters.stock ?? ''}
          onChange={(e) => {
            setFilter('stock', e.target.value);
          }}
        >
          {STOCK_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      <DataTable
        columns={columns}
        rows={products.data?.items ?? []}
        rowKey={(product) => product.id}
        loading={products.isPending}
        error={products.isError ? apiErrorMessage(products.error) : null}
        onRetry={() => {
          void products.refetch();
        }}
        sort={params.sort}
        onSortChange={setSort}
        rowClassName={(product) => (isLowStock(product) ? 'bg-warning-weak/40' : undefined)}
        empty={
          <EmptyState
            icon={Warehouse}
            title="Gösterilecek stok yok"
            description="Filtreyi değiştirin veya önce ürün ekleyin."
          />
        }
      />

      <PaginationBar meta={products.data?.meta} onPageChange={setPage} onLimitChange={setLimit} />

      <WasteDialog
        product={wasteTarget}
        unitAbbreviation={wasteTarget ? (unitAbbr.get(wasteTarget.unitId) ?? '') : ''}
        onClose={() => {
          setWasteTarget(null);
        }}
      />
      <AdjustDialog
        product={adjustTarget}
        unitAbbreviation={adjustTarget ? (unitAbbr.get(adjustTarget.unitId) ?? '') : ''}
        onClose={() => {
          setAdjustTarget(null);
        }}
      />
    </div>
  );
}
