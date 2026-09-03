'use client';

import { TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import type { ReactElement } from 'react';

import { formatCount, formatQuantity } from '@stokk/ui';

import type { LowStockRow } from '../../lib/api-types';

export interface LowStockBannerProps {
  rows: LowStockRow[] | undefined;
}

/**
 * Kritik stok uyarı bandı. Sayı değil, hangi ürünler olduğu da görünür —
 * esnaf bandı görünce doğrudan sipariş verebilsin.
 */
export function LowStockBanner({ rows }: LowStockBannerProps): ReactElement | null {
  if (!rows || rows.length === 0) return null;

  const preview = rows.slice(0, 4);

  return (
    <div
      role="status"
      className="rounded-card border-warning/30 bg-warning-weak text-warning flex flex-wrap items-center justify-between gap-3 border px-4 py-3"
    >
      <div className="flex items-start gap-2.5">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="text-sm">
          <p className="font-medium">
            {formatCount(rows.length)} ürün kritik seviyede veya altında
          </p>
          <p className="opacity-90">
            {preview.map((row) => `${row.name} (${formatQuantity(row.stockQuantity)})`).join(' · ')}
            {rows.length > preview.length ? ` · +${formatCount(rows.length - preview.length)}` : ''}
          </p>
        </div>
      </div>
      <Link href="/stock?stock=low" className="text-sm font-medium underline underline-offset-4">
        Kritik listeyi aç
      </Link>
    </div>
  );
}
