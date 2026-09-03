'use client';

import { ArrowDown, ArrowUp, ArrowUpDown, TriangleAlert } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { Button, Checkbox, cn, Table, TBody, TD, TH, THead, TR } from '@stokk/ui';

import { nextSort, sortDirection } from '../../lib/list-params';

export interface Column<T> {
  /** Sütun kimliği — görünürlük menüsü ve React key. */
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Sunucu taraflı sıralama alanı; verilmezse sütun sıralanamaz. */
  sortField?: string;
  /** Sayısal sütun: sağa yaslı + tabular rakam. */
  numeric?: boolean;
  /** Görünürlük menüsünde kapatılamaz (kimlik sütunu). */
  fixed?: boolean;
  className?: string;
}

export interface DataTableSelection {
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
}

export interface DataTableProps<T> {
  columns: readonly Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  /** Veri yokken gösterilecek içerik (EmptyState). */
  empty?: ReactNode;
  sort?: string;
  onSortChange?: (sort: string) => void;
  /** Satır seçimi (etiket basımı, toplu fiyat). */
  selection?: DataTableSelection;
  /** Gizlenmiş sütun anahtarları. */
  hiddenColumns?: ReadonlySet<string>;
  /** Satır vurgusu (kritik stok gibi). */
  rowClassName?: (row: T) => string | undefined;
}

const SKELETON_ROWS = 6;

/**
 * Ortak liste tablosu: sıralama, seçim, sütun görünürlüğü, yükleniyor/hata/boş
 * durumları tek yerde. Ürün, stok, hareket ve sayım listeleri bunu kullanır —
 * tablo mantığı ekran başına tekrarlanmaz.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  error = null,
  onRetry,
  empty,
  sort = '',
  onSortChange,
  selection,
  hiddenColumns,
  rowClassName,
}: DataTableProps<T>): ReactElement {
  const visible = columns.filter((c) => !hiddenColumns?.has(c.key));
  const keys = rows.map(rowKey);
  const selectedOnPage = keys.filter((k) => selection?.selected.has(k)).length;
  const allSelected = keys.length > 0 && selectedOnPage === keys.length;

  function toggleAll(): void {
    if (!selection) return;
    const next = new Set(selection.selected);
    if (allSelected) for (const k of keys) next.delete(k);
    else for (const k of keys) next.add(k);
    selection.onChange(next);
  }

  function toggleOne(key: string): void {
    if (!selection) return;
    const next = new Set(selection.selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    selection.onChange(next);
  }

  if (error) {
    return (
      <div className="rounded-card border-danger/30 bg-danger-weak flex flex-wrap items-center justify-between gap-3 border p-4">
        <p className="text-danger flex items-center gap-2 text-sm">
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          {error}
        </p>
        {onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Tekrar dene
          </Button>
        ) : null}
      </div>
    );
  }

  if (!loading && rows.length === 0 && empty) return <>{empty}</>;

  return (
    <div className="rounded-card border-border bg-surface-raised overflow-hidden border">
      <Table>
        <THead>
          <TR className="hover:bg-transparent">
            {selection ? (
              <TH className="w-10">
                <Checkbox
                  checked={allSelected}
                  indeterminate={selectedOnPage > 0 && !allSelected}
                  onChange={toggleAll}
                  aria-label="Sayfadaki tümünü seç"
                />
              </TH>
            ) : null}
            {visible.map((column) => {
              const field = column.sortField;
              const direction = field ? sortDirection(sort, field) : null;

              if (!field || !onSortChange) {
                return (
                  <TH key={column.key} numeric={column.numeric} className={column.className}>
                    {column.header}
                  </TH>
                );
              }

              return (
                <TH
                  key={column.key}
                  numeric={column.numeric}
                  className={column.className}
                  aria-sort={
                    direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'
                  }
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSortChange(nextSort(sort, field));
                    }}
                    className={cn(
                      'rounded-control hover:text-ink -mx-1 inline-flex items-center gap-1 px-1 py-0.5 font-medium',
                      column.numeric && 'flex-row-reverse',
                      direction && 'text-ink',
                    )}
                  >
                    {column.header}
                    {direction === 'asc' ? (
                      <ArrowUp className="size-3.5" aria-hidden />
                    ) : direction === 'desc' ? (
                      <ArrowDown className="size-3.5" aria-hidden />
                    ) : (
                      <ArrowUpDown className="text-ink-subtle size-3.5" aria-hidden />
                    )}
                  </button>
                </TH>
              );
            })}
          </TR>
        </THead>
        <TBody>
          {loading
            ? Array.from({ length: SKELETON_ROWS }, (_, i) => (
                <TR key={`skeleton-${String(i)}`} className="hover:bg-transparent">
                  {selection ? <TD /> : null}
                  {visible.map((column) => (
                    <TD key={column.key}>
                      <span className="bg-surface-sunken block h-4 w-full animate-pulse rounded" />
                    </TD>
                  ))}
                </TR>
              ))
            : rows.map((row) => {
                const key = rowKey(row);
                return (
                  <TR key={key} className={rowClassName?.(row)}>
                    {selection ? (
                      <TD>
                        <Checkbox
                          checked={selection.selected.has(key)}
                          onChange={() => {
                            toggleOne(key);
                          }}
                          aria-label="Satırı seç"
                        />
                      </TD>
                    ) : null}
                    {visible.map((column) => (
                      <TD key={column.key} numeric={column.numeric} className={column.className}>
                        {column.cell(row)}
                      </TD>
                    ))}
                  </TR>
                );
              })}
        </TBody>
      </Table>
      {loading ? (
        <p className="sr-only" role="status">
          Liste yükleniyor…
        </p>
      ) : null}
    </div>
  );
}
