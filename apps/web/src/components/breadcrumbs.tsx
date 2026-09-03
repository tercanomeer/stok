'use client';

import { usePathname } from 'next/navigation';
import type { ReactElement } from 'react';

import { NAV_ITEMS } from './nav';

const LABELS: Record<string, string> = Object.fromEntries(
  NAV_ITEMS.map((item) => [item.href, item.label]),
);

/** Basit kırıntı: Panel > <bölüm>. Route grupları path'e girmez, segment yolla eşlenir. */
export function Breadcrumbs(): ReactElement {
  const pathname = usePathname();
  const segment = pathname === '/' ? null : `/${pathname.split('/')[1] ?? ''}`;
  const current = segment ? LABELS[segment] : null;

  return (
    <nav aria-label="Konum" className="flex items-center gap-1.5 text-sm">
      <span className={current ? 'text-ink-muted' : 'text-ink font-medium'}>Panel</span>
      {current ? (
        <>
          <span className="text-ink-subtle" aria-hidden>
            /
          </span>
          <span className="text-ink font-medium">{current}</span>
        </>
      ) : null}
    </nav>
  );
}
