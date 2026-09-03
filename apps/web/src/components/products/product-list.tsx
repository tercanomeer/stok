'use client';

import {
  FileSpreadsheet,
  Package,
  PackagePlus,
  PencilLine,
  Percent,
  SlidersHorizontal,
  Tags,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, type ReactElement } from 'react';

import { PERMISSIONS } from '@stokk/types';
import {
  Badge,
  Button,
  EmptyState,
  formatCount,
  formatMoney,
  formatQuantity,
  Select,
  useToast,
} from '@stokk/ui';

import { LabelDialog } from './label-dialog';
import { useCategories, useBrands, useUnits, nameById } from '../../hooks/use-catalog';
import { useListParams } from '../../hooks/use-list-params';
import { usePageClamp } from '../../hooks/use-page-clamp';
import { useDeleteProduct, useProducts } from '../../hooks/use-products';
import { apiErrorMessage } from '../../lib/api';
import type { Product } from '../../lib/api-types';
import { usePermission } from '../../lib/permissions';
import { isLowStock } from '../../lib/stock-status';
import { Can } from '../can';
import { ColumnMenu } from '../common/column-menu';
import { ConfirmDialog } from '../common/confirm-dialog';
import { DataTable, type Column } from '../common/data-table';
import { LinkButton } from '../common/link-button';
import { PageHeader } from '../common/page-header';
import { PaginationBar } from '../common/pagination-bar';
import { SearchInput } from '../common/search-input';

const LIST_CONFIG = {
  filterKeys: ['categoryId', 'brandId', 'stock'] as const,
  defaultSort: 'name:asc',
};

const STOCK_FILTERS = [
  { value: '', label: 'Tüm ürünler' },
  { value: 'active', label: 'Yalnız aktif' },
  { value: 'low', label: 'Kritik seviyede' },
  { value: 'out', label: 'Stoğu biten' },
] as const;

/** Ürün listesi: sunucu taraflı sayfalama, arama, filtre, sütun görünürlüğü, seçim. */
export function ProductList(): ReactElement {
  const { params, setPage, setLimit, setSearch, setSort, setFilter } = useListParams(LIST_CONFIG);
  const products = useProducts(params);
  usePageClamp(products.data?.meta, setPage);
  const categories = useCategories();
  const brands = useBrands();
  const units = useUnits();
  const deleteProduct = useDeleteProduct();
  const toast = useToast();
  const canDelete = usePermission(PERMISSIONS.PRODUCT_DELETE);
  const canManage = usePermission(PERMISSIONS.PRODUCT_MANAGE);

  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set(['brand', 'vatRate']));
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null);

  const categoryNames = useMemo(() => nameById(categories.data), [categories.data]);
  const brandNames = useMemo(() => nameById(brands.data), [brands.data]);
  const unitAbbr = useMemo(
    () => new Map((units.data ?? []).map((u) => [u.id, u.abbreviation])),
    [units.data],
  );

  const columns = useMemo<Column<Product>[]>(
    () => [
      {
        key: 'name',
        header: 'Ürün',
        sortField: 'name',
        fixed: true,
        cell: (product) => (
          <div className="flex flex-col">
            <Link href={`/products/${product.id}`} className="text-ink font-medium hover:underline">
              {product.name}
            </Link>
            {product.barcodes.length > 0 ? (
              <span className="text-ink-subtle tabular text-xs">
                {product.barcodes.find((b) => b.isPrimary)?.value ?? product.barcodes[0]?.value}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        key: 'code',
        header: 'Kod',
        cell: (product) => <span className="tabular">{product.code ?? '—'}</span>,
      },
      {
        key: 'category',
        header: 'Kategori',
        cell: (product) =>
          product.categoryId ? (categoryNames.get(product.categoryId) ?? '—') : '—',
      },
      {
        key: 'brand',
        header: 'Marka',
        cell: (product) => (product.brandId ? (brandNames.get(product.brandId) ?? '—') : '—'),
      },
      {
        key: 'salePrice',
        header: 'Satış fiyatı',
        sortField: 'salePrice',
        numeric: true,
        cell: (product) => formatMoney(product.salePrice),
      },
      {
        key: 'vatRate',
        header: 'KDV',
        numeric: true,
        cell: (product) => `%${String(product.vatRate)}`,
      },
      {
        key: 'stockQuantity',
        header: 'Stok',
        sortField: 'stockQuantity',
        numeric: true,
        cell: (product) => (
          <span className={isLowStock(product) ? 'text-warning font-medium' : undefined}>
            {product.trackStock
              ? `${formatQuantity(product.stockQuantity)} ${unitAbbr.get(product.unitId) ?? ''}`
              : '—'}
          </span>
        ),
      },
      {
        key: 'status',
        header: 'Durum',
        cell: (product) =>
          !product.isActive ? (
            <Badge tone="neutral">Pasif</Badge>
          ) : isLowStock(product) ? (
            <Badge tone="warning">Kritik</Badge>
          ) : (
            <Badge tone="success">Aktif</Badge>
          ),
      },
      {
        key: 'actions',
        header: 'İşlem',
        className: 'w-24',
        cell: (product) => (
          <div className="flex items-center gap-1">
            <Can permission={PERMISSIONS.PRODUCT_MANAGE}>
              <Link
                href={`/products/${product.id}`}
                aria-label={`${product.name} ürününü düzenle`}
                className="rounded-control text-ink-muted hover:bg-surface-sunken hover:text-ink inline-flex size-8 items-center justify-center"
              >
                <PencilLine className="size-4" aria-hidden />
              </Link>
            </Can>
            <Can permission={PERMISSIONS.PRODUCT_DELETE}>
              <button
                type="button"
                aria-label={`${product.name} ürününü sil`}
                onClick={() => {
                  setPendingDelete(product);
                }}
                className="rounded-control text-ink-muted hover:bg-danger-weak hover:text-danger inline-flex size-8 items-center justify-center"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </Can>
          </div>
        ),
      },
    ],
    [categoryNames, brandNames, unitAbbr],
  );

  const visibleColumns = useMemo(
    () => (canManage || canDelete ? columns : columns.filter((c) => c.key !== 'actions')),
    [columns, canManage, canDelete],
  );

  const selectedIds = [...selected];

  function confirmDelete(): void {
    if (!pendingDelete) return;
    const name = pendingDelete.name;
    deleteProduct.mutate(pendingDelete.id, {
      onSuccess: () => {
        toast.success('Ürün silindi', name);
        setPendingDelete(null);
      },
      onError: (error) => {
        toast.error('Ürün silinemedi', apiErrorMessage(error));
      },
    });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Ürünler"
        description="Katalog, fiyat ve barkod yönetimi."
        actions={
          <>
            <Can permission={PERMISSIONS.CATALOG_MANAGE}>
              <LinkButton href="/products/catalog" variant="outline">
                <SlidersHorizontal className="size-4" aria-hidden />
                Kategori · Marka · Birim
              </LinkButton>
            </Can>
            <Can permission={PERMISSIONS.PRODUCT_PRICE_BULK_UPDATE}>
              <LinkButton href="/products/bulk-price" variant="outline">
                <Percent className="size-4" aria-hidden />
                Toplu fiyat
              </LinkButton>
            </Can>
            <Can permission={PERMISSIONS.PRODUCT_IMPORT}>
              <LinkButton href="/products/import" variant="outline">
                <FileSpreadsheet className="size-4" aria-hidden />
                İçe aktar
              </LinkButton>
            </Can>
            <Can permission={PERMISSIONS.PRODUCT_MANAGE}>
              <LinkButton href="/products/new">
                <PackagePlus className="size-4" aria-hidden />
                Yeni ürün
              </LinkButton>
            </Can>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={params.search}
          onChange={setSearch}
          placeholder="Ürün adı, kod veya barkod"
          className="min-w-64 flex-1"
        />
        <Select
          className="w-44"
          aria-label="Kategori filtresi"
          value={params.filters.categoryId ?? ''}
          onChange={(e) => {
            setFilter('categoryId', e.target.value);
          }}
        >
          <option value="">Tüm kategoriler</option>
          {(categories.data ?? []).map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
        <Select
          className="w-40"
          aria-label="Marka filtresi"
          value={params.filters.brandId ?? ''}
          onChange={(e) => {
            setFilter('brandId', e.target.value);
          }}
        >
          <option value="">Tüm markalar</option>
          {(brands.data ?? []).map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
            </option>
          ))}
        </Select>
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
        <ColumnMenu columns={visibleColumns} hidden={hidden} onChange={setHidden} />
      </div>

      {selected.size > 0 ? (
        <div className="rounded-card border-brand/30 bg-brand-weak text-brand-weak-ink flex flex-wrap items-center justify-between gap-3 border px-4 py-2.5">
          <p className="text-sm font-medium" aria-live="polite">
            {formatCount(selected.size)} ürün seçili
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setLabelsOpen(true);
              }}
            >
              <Tags aria-hidden />
              Etiket bas
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSelected(new Set());
              }}
            >
              Seçimi temizle
            </Button>
          </div>
        </div>
      ) : null}

      <DataTable
        columns={visibleColumns}
        rows={products.data?.items ?? []}
        rowKey={(product) => product.id}
        loading={products.isPending}
        error={products.isError ? apiErrorMessage(products.error) : null}
        onRetry={() => {
          void products.refetch();
        }}
        sort={params.sort}
        onSortChange={setSort}
        hiddenColumns={hidden}
        selection={{ selected, onChange: setSelected }}
        rowClassName={(product) => (isLowStock(product) ? 'bg-warning-weak/40' : undefined)}
        empty={
          <EmptyState
            icon={Package}
            title={params.search ? 'Eşleşen ürün yok' : 'Henüz ürün yok'}
            description={
              params.search
                ? 'Arama veya filtreleri değiştirip tekrar deneyin.'
                : 'İlk ürününüzü ekleyin ya da Excel dosyasından toplu aktarın.'
            }
          />
        }
      />

      <PaginationBar meta={products.data?.meta} onPageChange={setPage} onLimitChange={setLimit} />

      <LabelDialog
        open={labelsOpen}
        productIds={selectedIds}
        onClose={() => {
          setLabelsOpen(false);
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Ürünü sil"
        description={`"${pendingDelete?.name ?? ''}" silinecek. Ürün pasife alınır, geçmiş hareketleri korunur. Barkodları serbest kalır.`}
        confirmLabel="Sil"
        destructive
        loading={deleteProduct.isPending}
        onConfirm={confirmDelete}
        onClose={() => {
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
