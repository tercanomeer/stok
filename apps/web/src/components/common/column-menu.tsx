'use client';

import { Columns3 } from 'lucide-react';
import type { ReactElement } from 'react';

import { Checkbox } from '@stokk/ui';

import type { Column } from './data-table';

export interface ColumnMenuProps<T> {
  columns: readonly Column<T>[];
  hidden: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
}

/**
 * Sütun görünürlüğü menüsü. Yerel `<details>` — açılır panelin klavye ve Esc
 * davranışı tarayıcıdan gelir, ekstra ARIA/kütüphane gerekmez (Faz 8 kararı).
 * `fixed` sütunlar listelenmez: kimlik sütunu kapatılamaz.
 */
export function ColumnMenu<T>({ columns, hidden, onChange }: ColumnMenuProps<T>): ReactElement {
  const toggleable = columns.filter((c) => !c.fixed);

  return (
    <details className="relative">
      <summary className="rounded-control border-border-strong text-ink hover:bg-surface-sunken flex h-10 cursor-pointer list-none items-center gap-2 border px-3 text-sm select-none [&::-webkit-details-marker]:hidden">
        <Columns3 className="size-4" aria-hidden />
        Sütunlar
      </summary>
      <div className="rounded-card border-border bg-surface-raised absolute right-0 z-20 mt-1 w-56 border p-2 shadow-[var(--shadow-overlay)]">
        <ul className="flex flex-col">
          {toggleable.map((column) => (
            <li key={column.key}>
              <label className="rounded-control hover:bg-surface-sunken flex cursor-pointer items-center gap-2.5 px-2 py-1.5 text-sm">
                <Checkbox
                  checked={!hidden.has(column.key)}
                  onChange={() => {
                    const next = new Set(hidden);
                    if (next.has(column.key)) next.delete(column.key);
                    else next.add(column.key);
                    onChange(next);
                  }}
                />
                {column.header}
              </label>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
