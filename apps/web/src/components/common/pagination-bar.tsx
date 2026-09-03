'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactElement } from 'react';

import { Button, formatCount, Select } from '@stokk/ui';

import type { PaginationMeta } from '../../lib/api-types';

export interface PaginationBarProps {
  meta: PaginationMeta | undefined;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
}

const LIMIT_OPTIONS = [20, 50, 100] as const;

/** Sunucu taraflı sayfalama çubuğu — toplam kayıt, sayfa gezinme, sayfa boyutu. */
export function PaginationBar({
  meta,
  onPageChange,
  onLimitChange,
}: PaginationBarProps): ReactElement | null {
  if (!meta) return null;

  const first = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
  const last = Math.min(meta.page * meta.limit, meta.total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-ink-muted text-sm" aria-live="polite">
        {meta.total === 0
          ? 'Kayıt yok'
          : `${formatCount(meta.total)} kayıttan ${formatCount(first)}–${formatCount(last)} arası`}
      </p>

      <div className="flex items-center gap-3">
        <label className="text-ink-muted flex items-center gap-2 text-sm">
          Sayfada
          <Select
            className="h-9 w-20"
            value={String(meta.limit)}
            onChange={(e) => {
              onLimitChange(Number.parseInt(e.target.value, 10));
            }}
          >
            {LIMIT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </label>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            aria-label="Önceki sayfa"
            disabled={meta.page <= 1}
            onClick={() => {
              onPageChange(meta.page - 1);
            }}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <span className="text-ink tabular px-2 text-sm">
            {formatCount(meta.page)} / {formatCount(meta.pages)}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            aria-label="Sonraki sayfa"
            disabled={meta.page >= meta.pages}
            onClick={() => {
              onPageChange(meta.page + 1);
            }}
          >
            <ChevronRight aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
