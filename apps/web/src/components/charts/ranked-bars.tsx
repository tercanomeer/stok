'use client';

import { useId, type ReactElement } from 'react';

import { cn } from '@stokk/ui';

export interface RankedRow {
  id: string;
  label: string;
  value: string;
  display: string;
  hint?: string;
}

export interface RankedBarsProps {
  rows: RankedRow[];
  title: string;
  valueLabel: string;
  className?: string;
}

/**
 * Yatay sıralı çubuklar — uzun adlı kategorilerde büyüklük karşılaştırması
 * (dataviz: "compare magnitude, long-named categories → go horizontal").
 *
 * Tek hue (marka), değer HER SATIRDA doğrudan yazılır: satır sayısı az ve etiket
 * zaten yanında, bu yüzden ipucuna gerek yok. Renk tek başına anlam taşımaz.
 */
export function RankedBars({ rows, title, valueLabel, className }: RankedBarsProps): ReactElement {
  const tableId = useId();

  if (rows.length === 0) {
    return <p className="text-ink-muted py-8 text-center text-sm">Bu aralıkta veri yok.</p>;
  }

  const max = Math.max(
    ...rows.map((row) => {
      const parsed = Number.parseFloat(row.value);
      return Number.isFinite(parsed) ? parsed : 0;
    }),
    0,
  );

  return (
    <div className={cn('space-y-2', className)}>
      <ul className="space-y-2" aria-describedby={tableId}>
        {rows.map((row) => {
          const parsed = Number.parseFloat(row.value);
          const ratio = max > 0 && Number.isFinite(parsed) ? Math.max(parsed / max, 0) : 0;
          return (
            <li key={row.id} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-ink truncate font-medium">{row.label}</span>
                <span className="text-ink tabular shrink-0">
                  {row.display}
                  {row.hint ? <span className="text-ink-muted ml-2">{row.hint}</span> : null}
                </span>
              </div>
              <div className="bg-surface-sunken h-2 w-full overflow-hidden rounded-full">
                <div
                  className="bg-brand h-full rounded-full"
                  style={{ width: `${String(Math.round(ratio * 100))}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <table id={tableId} className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Ad</th>
            <th scope="col">{valueLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <th scope="row">{row.label}</th>
              <td>{row.display}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
