'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactElement } from 'react';

import { cn } from '@stokk/ui';

export interface SectionTab {
  label: string;
  href: string;
}

/** Bölüm içi gezinme (Stok → Liste / Hareketler / Sayım). Aktif sekme alt şeritle işaretli. */
export function SectionTabs({ tabs }: { tabs: readonly SectionTab[] }): ReactElement {
  const pathname = usePathname();

  return (
    <nav className="border-border flex gap-1 border-b" aria-label="Bölüm menüsü">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              active ? 'border-brand text-ink' : 'text-ink-muted hover:text-ink border-transparent',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
